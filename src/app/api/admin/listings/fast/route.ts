// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/fast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 K — 사장님 명령 2026-05-11 (진단 후 진짜 root cause 기반).
//
// 목적:
//   첫 진입 시 1-2초 안 사장님 시야에 매물 카드 200건 표시.
//   기존 /api/admin/listings?fields=minimal 의 60K processing (28초) 우회.
//
// 핵심 설계 (v350 회귀와 다른 점):
//   - export const dynamic = 'force-dynamic' → unstable_cache 우회
//   - 단순 .from('listings').limit(200) — 60 chunked pagination 제거
//   - listing_images 별도 IN query (200 ids 만 — 1 batch)
//   - 응답 200KB 이하 (200 × 1KB)
//
// v350 와 차이:
//   - v350: /api/admin/listings?limit=200 → 같은 unstable_cache key → 60K cache build 대기 → 36초
//   - K  : /api/admin/listings/fast      → 다른 endpoint, cache 없음, 단순 query → 1-2초
//
// 응답 shape: /api/admin/listings?fields=minimal 과 100% 호환.
//   { success, data, total, source: 'fast' }
// → 클라이언트 patch v351 이 받아 WS.allListings 에 임시 set.
//
// 회귀 회피 (회귀 7번 학습):
//   - 기존 route.ts 안 건드림 → 60K 응답 그대로 = Fix 38/Step 4 회귀 회피
//   - unstable_cache 우회 → cache key 충돌 없음 (v350 fail 회피)
//   - DB query 단순 .limit(200) — chunked pagination 없음 → fast
//   - 등록 안 하면 prod 영향 0 (Step K1 단독은 검증 only)
//   - selectFields 는 기존 minimal 과 동일 → 응답 shape 호환
//
// 보안:
//   - verifyAdminAuth 필수 (기존 listings 와 동일)
//   - parameterized query (supabase-js) → SQL injection 차단

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { isSelfHostedImage, preferSelfHostedImages } from '@/lib/image-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';  // ⭐ unstable_cache 우회 (v350 fail 회피)
export const maxDuration = 30;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam && /^\d+$/.test(limitParam)
      ? Math.min(parseInt(limitParam, 10), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // scope 처리 (간단 버전 — 기존 listings 와 동일 패턴)
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
      } catch { /* degrade */ }
      if (!scopeUid) {
        scope = 'all';
        scopeAuth = 'failed_degrade_all';
      } else {
        scopeAuth = 'ok';
      }
    }

    // ── selectFields: /api/admin/listings?fields=minimal 과 동일 (Fix 37 호환) ──
    const selectFields = [
      'id', 'title', 'type', 'deal', 'status',
      'deposit', 'monthly', 'price',
      'maintenance_fee',  // Fix 37
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

    // ── 단순 listings query (cache 우회) ──
    let queryBuilder: any = supabase
      .from('listings')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (scope === 'mine' && scopeUid) queryBuilder = queryBuilder.eq('created_by', scopeUid);

    const _dbStart = Date.now();
    const { data, error } = await queryBuilder;
    const _dbMs = Date.now() - _dbStart;

    if (error) {
      console.error('[admin/listings/fast] error', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows: any[] = (data as any[]) || [];

    // ── listing_images 별도 IN query (200 ids 만 — 1 batch, parallel 불필요) ──
    const imageByListing: Record<string, string> = {};
    const _imgStart = Date.now();
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
        console.error('[admin/listings/fast] image fetch error', e);
      }
    }
    const _imgMs = Date.now() - _imgStart;

    // ── slim + image policy + null/empty 제거 (응답 size 추가 절감) ──
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
      // building_info 슬림화 — 도로명/지번만
      if (row.building_info && typeof row.building_info === 'object') {
        const bi = row.building_info as any;
        row.building_info = {
          ...(bi['도로명주소'] ? { '도로명주소': bi['도로명주소'] } : {}),
          ...(bi['지번주소'] ? { '지번주소': bi['지번주소'] } : {}),
        };
      }
      const cleaned: any = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined || v === '' || v === false) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v as object).length === 0) continue;
        cleaned[k] = v;
      }
      return cleaned;
    });

    const _totalMs = Date.now() - _t0;
    console.log('[admin/listings/fast] rows=' + slim.length +
      ' db=' + _dbMs + 'ms img=' + _imgMs + 'ms total=' + _totalMs + 'ms scope=' + scope);

    return NextResponse.json({
      success: true,
      data: slim,
      total: slim.length,
      source: 'fast',
      scope,
      scope_auth: scopeAuth,
      _timing: { db: _dbMs, img: _imgMs, total: _totalMs },
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/fast] unexpected error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 500 }
    );
  }
}
