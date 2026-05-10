// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/search
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 C — 사장님 명령 2026-05-11.
// Server-side ILIKE 검색 endpoint. 60K 매물 안에서 server side filter
// → 결과 (≤500) 반환. 첫 진입 limit=200 (Step 4 적용 예정) +
// 검색은 60K 모두 가능 보장.
//
// 응답 shape: /api/admin/listings?fields=minimal 과 동일.
//   { success, data, total, query, scope, scope_auth }
// 클라이언트 patch v349 가 사용 → WS.allListings 또는 WS.searchResults 에 set.
//
// 호환 호출:
//   GET /api/admin/listings/search?q=신림동
//   GET /api/admin/listings/search?q=서정빌리지&limit=200
//   GET /api/admin/listings/search?q=112552           (ID lookup — q 가 숫자)
//   GET /api/admin/listings/search?q=원룸&type=원룸&scope=mine
//
// 보안:
//   - verifyAdminAuth 필수
//   - q 100자 cap, 메타문자 sanitize (PostgREST .or 파서 보호)
//   - parameterized via supabase-js .ilike → SQL injection 차단
//
// 회귀 회피 (이번 세션 5번 회귀 학습):
//   - listings_minimal_mv 사용 X (Fix 34 PostgREST expose 문제)
//   - chunked parallel RPC 사용 X (Fix 36c prod 19s)
//   - client wrap 사용 X (Fix 36 v294 defineProperty 충돌)
//   - 단순 .from('listings') + ILIKE — 60K 안에서 1-3s 예상
//   - 호출 안 되면 prod 영향 0 (Step 1 검증 only)

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { isSelfHostedImage, preferSelfHostedImages } from '@/lib/image-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_QUERY_LEN = 100;

// PostgREST .or() 파서 메타문자: ',' '(' ')' '\'  ':' (필드/연산 구분).
// ILIKE 와일드카드: '%' '_'  (사용자 입력에서 strip — 부분매치는 endpoint 가 자동 추가).
function sanitizeQuery(q: string): string {
  return q
    .slice(0, MAX_QUERY_LEN)
    .replace(/[,()\\:%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const rawQ = (searchParams.get('q') || '').trim();
    const q = sanitizeQuery(rawQ);
    const typeFilter = (searchParams.get('type') || '').trim();
    const limitParam = searchParams.get('limit');
    const limit = limitParam && /^\d+$/.test(limitParam)
      ? Math.min(parseInt(limitParam, 10), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // scope=mine → 내 매물만, 외엔 all (기존 listings 와 동일 degrade 로직)
    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    let scopeUid: string | null = null;
    let scopeAuth: 'ok' | 'failed_degrade_all' | null = null;
    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        let token = authHdr.replace(/^Bearer\s+/i, '').trim();
        while (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
        if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
          const { data } = await Promise.race([
            supabase.auth.getUser(token),
            new Promise<{ data: { user: null } }>((_, rej) =>
              setTimeout(() => rej(new Error('uid_timeout')), 2000)
            ),
          ]) as { data: { user: { id: string } | null } };
          scopeUid = data?.user?.id ?? null;
        }
      } catch { /* UID 추출 실패 → 아래 degrade */ }
      if (!scopeUid) {
        scope = 'all';
        scopeAuth = 'failed_degrade_all';
      } else {
        scopeAuth = 'ok';
      }
    }

    // 빈 query → 빈 결과. 클라이언트 patch 는 빈 결과 시 client filter fallback.
    if (!q) {
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        query: q,
        scope,
        scope_auth: scopeAuth,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    // ── selectFields: /api/admin/listings?fields=minimal 과 동일 (Fix 37 호환) ──
    //   응답 shape 일치 → client 의 list rendering 코드 그대로 작동
    const selectFields = [
      'id', 'title', 'type', 'deal', 'status',
      'deposit', 'monthly', 'price',
      'maintenance_fee',  // Fix 37: maintenance_includes 제거
      'area_m2', 'area_supply_m2',
      'floor_current', 'floor_total',
      'rooms', 'bathrooms', 'direction',
      'address', 'address_detail', 'dong',
      'building_name',
      'building_dong', 'building_ho',
      'lat', 'lng',
      'available_date', 'built_year',
      'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
      'business_type', 'goodwill_fee',
      'station_name', 'station_distance',
      'created_at',
      'created_by',
      'last_verified_at',
      'source_site',
      'updated_at',
      'building_info',
    ].join(',');

    // ── ILIKE OR 검색 across 6 핵심 필드 ──
    //   PostgREST .or() 문법: 'col.op.value,col.op.value,...'
    //   ILIKE %q% — case-insensitive 부분 매치
    const orFilter = [
      `title.ilike.%${q}%`,
      `address.ilike.%${q}%`,
      `address_detail.ilike.%${q}%`,
      `building_name.ilike.%${q}%`,
      `dong.ilike.%${q}%`,
      `building_dong.ilike.%${q}%`,
    ].join(',');

    let queryBuilder: any = supabase
      .from('listings')
      .select(selectFields, { count: 'exact' })
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (typeFilter) queryBuilder = queryBuilder.eq('type', typeFilter);
    if (scope === 'mine' && scopeUid) queryBuilder = queryBuilder.eq('created_by', scopeUid);

    // ID lookup boost: q 가 숫자 only 면 listings.id 일치도 prepend (검색 누락 방지)
    let idMatched: any = null;
    if (/^\d+$/.test(q)) {
      try {
        const { data: idRow } = await supabase
          .from('listings')
          .select(selectFields)
          .eq('id', parseInt(q, 10))
          .limit(1)
          .maybeSingle();
        if (idRow) idMatched = idRow;
      } catch { /* ID lookup 실패는 silent fail — 일반 검색 결과만 반환 */ }
    }

    const _searchStart = Date.now();
    const { data, error, count } = await queryBuilder;
    const _searchMs = Date.now() - _searchStart;

    if (error) {
      console.error('[admin/listings/search] error', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let rows: any[] = (data as any[]) || [];
    if (idMatched && !rows.some((r: any) => r.id === idMatched.id)) {
      rows = [idMatched, ...rows].slice(0, limit);
    }

    // ── listing_images 별도 IN 쿼리 (L-search7 패턴 — JOIN 회피) ──
    //   limit=200 이라 1 batch 면 충분, parallel 불필요
    const imageByListing: Record<string, string> = {};
    if (rows.length > 0) {
      try {
        const ids = rows.map((r: any) => r.id);
        const { data: imgs, error: imgErr } = await supabase
          .from('listing_images')
          .select('listing_id, url, sort_order')
          .in('listing_id', ids)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .limit(100000);
        if (!imgErr && imgs) {
          for (const im of imgs as any[]) {
            const lid = String(im.listing_id);
            if (!imageByListing[lid] && im.url) imageByListing[lid] = im.url;
          }
        }
      } catch (e) {
        console.error('[admin/listings/search] image fetch error', e);
        // 실패해도 rows 응답 유지 (이미지 없음으로 표시)
      }
    }

    // ── slim + 이미지 매핑 + image-policy + null/빈값 제거 ──
    const slim = rows.map((row: any) => {
      const imgUrl = imageByListing[String(row.id)];
      row.listing_images = imgUrl ? [{ url: imgUrl }] : [];
      if (row.source_site) {
        const policed = preferSelfHostedImages({
          source_site: row.source_site,
          listing_images: row.listing_images || [],
        });
        row.listing_images = policed.listing_images;
        if (row.thumbnail_url && !isSelfHostedImage(row.thumbnail_url)) {
          row.thumbnail_url = null;
        }
      }
      // building_info 슬림화 — 도로명/지번 두 키만 (v327/v328 patch 가 사용)
      if (row.building_info && typeof row.building_info === 'object') {
        const bi = row.building_info as any;
        row.building_info = {
          ...(bi['도로명주소'] ? { '도로명주소': bi['도로명주소'] } : {}),
          ...(bi['지번주소'] ? { '지번주소': bi['지번주소'] } : {}),
        };
      }
      // null / undefined / '' / false / [] / {} 제거 (페이로드 20-30% ↓)
      const cleaned: any = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined || v === '' || v === false) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v as object).length === 0) continue;
        cleaned[k] = v;
      }
      return cleaned;
    });

    console.log('[admin/listings/search] q=' + JSON.stringify(q) +
      ' rows=' + slim.length + ' total=' + (count ?? slim.length) +
      ' search_ms=' + _searchMs + ' scope=' + scope);

    return NextResponse.json({
      success: true,
      data: slim,
      total: count ?? slim.length,
      query: q,
      scope,
      scope_auth: scopeAuth,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/search] unexpected error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown' },
      { status: 500 }
    );
  }
}
