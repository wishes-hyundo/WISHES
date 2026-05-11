// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/mv
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 R Phase 2 — production endpoint (사장님 명령 2026-05-11).
//
// mv-test 검증 결과 (10f3a69 commit):
//   success: true, rows: 66214, time: 6956ms, has_thumb: true
//
// 목적:
//   listings_minimal_mv 직접 사용 → 60K 매물 7초 안 응답.
//   listing_images IN query (5-8초) 자동 제거 (mv 가 thumb_url 컬럼 포함).
//   사장님 모든 필터/검색이 60K 안에서 정상 작동.
//
// 응답 shape: /api/admin/listings?fields=minimal 과 100% 호환.
//   { success, data: [...60K], total, source: 'mv', _timing }
// → content.js 의 정상 흐름 그대로 작동.
//
// 회귀 회피 (회귀 7번 학습):
//   - 기존 route.ts 안 건드림 (회귀 5/6/7 회피)
//   - 새 endpoint → cache key 충돌 X (v350 회귀 회피)
//   - mv direct .from() — mv-test 로 expose 검증됨 (Fix 34 회피)
//   - chunked range 10K × 7 batches — PostgREST 8s timeout 안전 (Fix 36b 회피)
//   - 등록 안 하면 prod 영향 0
//
// content.js 호환:
//   - row.thumb_url → row.listing_images = [{url: thumb_url}]
//   - building_info jsonb → 도로명/지번 두 키만 추출
//   - image-policy 적용 (preferSelfHostedImages, isSelfHostedImage)
//   - null/empty 제거 (응답 size ↓)
//
// 보안:
//   - verifyAdminAuth 필수
//   - scope=mine 처리 (기존 listings 와 동일)

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

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    // scope 처리 (기존 listings 와 동일)
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

    // ── mv direct chunked fetch (10K × 7 batches) ──
    // PostgREST 8s statement timeout 안전 (mv-test 검증: 평균 1초/page)
    const PAGE_SIZE = 10000;
    const MAX_PAGES = 10;  // 최대 100K rows 안전 cap
    const _fetchStart = Date.now();

    let allData: any[] = [];
    let from = 0;
    let pageCount = 0;

    while (pageCount < MAX_PAGES) {
      const pageEnd = from + PAGE_SIZE - 1;
      let q: any = supabase
        .from('listings_minimal_mv')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, pageEnd);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);

      const { data, error } = await q;
      pageCount++;

      if (error) {
        console.error('[admin/listings/mv] page ' + pageCount + ' error', error);
        return NextResponse.json({
          success: false,
          source: 'mv',
          error: error.message,
          partial_rows: allData.length,
          page: pageCount,
        }, { status: 500 });
      }

      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const _fetchMs = Date.now() - _fetchStart;

    // ── slim transform — mv.thumb_url → listing_images 변환 + image-policy + cleaned ──
    const _transformStart = Date.now();
    const slim = allData.map((row: any) => {
      // thumb_url → listing_images = [{url}] (content.js 호환)
      const thumbUrl = row.thumb_url;
      row.listing_images = thumbUrl ? [{ url: thumbUrl }] : [];
      delete row.thumb_url;  // client 에 thumb_url 별도 노출 X (listing_images 만 사용)

      // image-policy: 크롤링 매물의 외부 호스트 이미지 처리
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

      // building_info 슬림화 — 도로명/지번 두 키만 (route.ts 의 minimal path 와 동일)
      if (row.building_info && typeof row.building_info === 'object') {
        const bi = row.building_info as any;
        row.building_info = {
          ...(bi['도로명주소'] ? { '도로명주소': bi['도로명주소'] } : {}),
          ...(bi['지번주소'] ? { '지번주소': bi['지번주소'] } : {}),
        };
      }

      // null / undefined / '' / false / [] / {} 제거 (응답 size 20-30% ↓)
      const cleaned: any = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined || v === '' || v === false) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v as object).length === 0) continue;
        cleaned[k] = v;
      }
      return cleaned;
    });
    const _transformMs = Date.now() - _transformStart;

    const _totalMs = Date.now() - _t0;

    console.log('[admin/listings/mv] rows=' + slim.length +
      ' pages=' + pageCount + ' fetch=' + _fetchMs + 'ms transform=' + _transformMs +
      'ms total=' + _totalMs + 'ms scope=' + scope);

    return NextResponse.json({
      success: true,
      data: slim,
      total: slim.length,
      source: 'mv',
      scope,
      scope_auth: scopeAuth,
      _timing: {
        fetch_ms: _fetchMs,
        transform_ms: _transformMs,
        total_ms: _totalMs,
      },
    }, {
      headers: {
        'Cache-Control': scope === 'mine'
          ? 'private, max-age=30'
          : 'public, s-maxage=300, stale-while-revalidate=3600',
        'Vary': scope === 'mine' ? 'Authorization' : 'Accept-Encoding',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/mv] unexpected error', e);
    return NextResponse.json(
      { success: false, source: 'mv', error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 500 }
    );
  }
}
