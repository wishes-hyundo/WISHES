// ━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/page (v2: search/filter)
// ━━━━━━━━━━━━━━━━━━━━━━
// 사장님 명령 2026-05-12. 페이지네이션 + 검색/필터 지원.
//
// params: page, size, sort, scope, q (keyword), type, deal
// 응답: { success, data, page, size, total, has_more, _ms }

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { isSelfHostedImage, preferSelfHostedImages } from '@/lib/image-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

const SELECT_FIELDS = [
  'id', 'title', 'type', 'deal', 'status',
  'deposit', 'monthly', 'price', 'maintenance_fee',
  'area_m2', 'area_supply_m2',
  'floor_current', 'floor_total',
  'rooms', 'bathrooms', 'direction',
  'address', 'address_detail', 'dong',
  'building_name', 'building_dong', 'building_ho',
  'lat', 'lng', 'available_date', 'built_year',
  'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'business_type', 'goodwill_fee', 'station_name', 'station_distance',
  'created_at', 'created_by', 'last_verified_at', 'source_site', 'updated_at',
  'road_address', 'road_address_fetched_at',
  'building_info',
].join(',');

// v378 v2 (2026-05-14 사장님 명령 - freeze fix):
//   매물 카드 image 가 ?w=1200 으로 와서 200-400KB. 카드 표시 109px 이므로 너무 큼.
//   server side 에서 CloudFront url 의 ?w → ?w=400 으로 shrink. size 80% 감소.
//   modal/lightbox 는 다른 endpoint 거치므로 영향 X.
function shrinkCardImg(url?: string): string | undefined {
  if (!url) return url;
  // [2026-05-15 사장님 명령] CDN host 확장: cloudfront + workers.dev (새 image proxy)
  const isResizable = /d4k1brqee4emz\.cloudfront\.net/i.test(url) ||
                      /wishes-image-proxy\.wishes-img\.workers\.dev/i.test(url) ||
                      /\.workers\.dev/i.test(url);
  if (!isResizable) return url;
  if (/[?&]w=\d+/.test(url)) {
    return url.replace(/([?&])w=\d+/g, '$1w=220');
  }
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'w=220';
}

// [Option C 2026-05-14]: hero_url for modal large view (?w=1200 + nocap=1)
function buildHeroUrl(url?: string): string | undefined {
  if (!url) return url;
  // [2026-05-15 사장님 명령] CDN host 확장: cloudfront + workers.dev (새 image proxy)
  const isResizable = /d4k1brqee4emz\.cloudfront\.net/i.test(url) ||
                      /wishes-image-proxy\.wishes-img\.workers\.dev/i.test(url) ||
                      /\.workers\.dev/i.test(url);
  if (!isResizable) return url;
  let h = url;
  if (/[?&]w=\d+/.test(h)) {
    h = h.replace(/([?&])w=\d+/g, '$1w=1200');
  } else {
    h = h + (h.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
  }
  return '/api/img-proxy?url=' + encodeURIComponent(h) + '&nocap=1';
}

function slimRow(row: any, imgUrl?: string): any {
  row.listing_images = imgUrl
    ? [{ url: shrinkCardImg(imgUrl), hero_url: buildHeroUrl(imgUrl) }]
    : [];
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
  // L-bldg-fix (2026-05-14): building_info 슬림 로직 제거 — 도로명/지번 없는 신규 수집 매물의
  //   building_info 가 빈 객체로 만들어져서 cleanup 에서 제거됨 → 도로명 표시 불가 회귀.
  //   원본 building_info 그대로 전송. (응답 size 살짝 증가하지만 사용자 회귀 fix 우선)
  for (const k in row) {
    const v = row[k];
    if (v === null || v === undefined || v === '' || v === false) {
      delete row[k];
    } else if (Array.isArray(v) && v.length === 0) {
      delete row[k];
    } else if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0) {
      delete row[k];
    }
  }
  return row;
}

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const sizeRaw = parseInt(searchParams.get('size') || '100', 10) || 100;
    const size = Math.max(1, Math.min(200, sizeRaw));
    const sort = (searchParams.get('sort') || 'latest').toLowerCase();
    const ascending = sort === 'oldest';

    // ★ v2 — 검색/필터 params
    const q = (searchParams.get('q') || '').trim();
    const typeFilter = (searchParams.get('type') || '').trim();
    const dealFilter = (searchParams.get('deal') || '').trim();
    const statusFilter = (searchParams.get('status') || '').trim();

    // ★ v3 (2026-05-15 사장님 명령) — 추가 filter params (Phase A.1)
    //   - 클라이언트 v397 patch 가 보내는 33개 filter
    //   - A.1 단계: 받기만 하고 아직 SQL 적용 안 함 (안전 도입)
    //   - A.2+ 단계에서 단계별 SQL chain 적용 예정
    const v3 = {
      // 다중 선택
      types: (searchParams.get('types') || '').split(',').map(x => x.trim()).filter(Boolean),
      deals: (searchParams.get('deals') || '').split(',').map(x => x.trim()).filter(Boolean),
      statuses: (searchParams.get('statuses') || '').split(',').map(x => x.trim()).filter(Boolean),
      // 카테고리
      floor_type: (searchParams.get('floor_type') || '').trim(),
      room_counts: (searchParams.get('room_counts') || '').split(',').map(x => x.trim()).filter(Boolean),
      parking_min: parseInt(searchParams.get('parking_min') || '0', 10) || 0,
      built_year_min: parseInt(searchParams.get('built_year_min') || '0', 10) || 0,
      // 가격 범위
      min_deposit: parseInt(searchParams.get('min_deposit') || '0', 10) || null,
      max_deposit: parseInt(searchParams.get('max_deposit') || '0', 10) || null,
      min_monthly: parseInt(searchParams.get('min_monthly') || '0', 10) || null,
      max_monthly: parseInt(searchParams.get('max_monthly') || '0', 10) || null,
      include_mgmt: searchParams.get('include_mgmt') === '1',
      min_sale: parseInt(searchParams.get('min_sale') || '0', 10) || null,
      max_sale: parseInt(searchParams.get('max_sale') || '0', 10) || null,
      min_base: parseInt(searchParams.get('min_base') || '0', 10) || null,
      max_base: parseInt(searchParams.get('max_base') || '0', 10) || null,
      // 면적 (m² 또는 평)
      min_area: parseFloat(searchParams.get('min_area') || '0') || null,
      max_area: parseFloat(searchParams.get('max_area') || '0') || null,
      area_unit: (searchParams.get('area_unit') || 'm2').trim(),
      min_supply: parseFloat(searchParams.get('min_supply') || '0') || null,
      max_supply: parseFloat(searchParams.get('max_supply') || '0') || null,
      supply_unit: (searchParams.get('supply_unit') || 'm2').trim(),
      // boolean checks
      building_photo: searchParams.get('building_photo') === '1',
      interior_photo: searchParams.get('interior_photo') === '1',
      parking_available: searchParams.get('parking_available') === '1',
      empty_now: searchParams.get('empty_now') === '1',
      elevator: searchParams.get('elevator') === '1',
      loan_available: searchParams.get('loan_available') === '1',
      no_full_option: searchParams.get('no_full_option') === '1',
      full_option_only: searchParams.get('full_option_only') === '1',
      price_nego: searchParams.get('price_nego') === '1',
      // 지역
      selected_dongs: (searchParams.get('selected_dongs') || '').split('|').map(x => x.trim()).filter(Boolean),
      selected_regions: (searchParams.get('selected_regions') || '').split('|').map(x => x.trim()).filter(Boolean),
      // 키워드 + 건물
      jibun_start: (searchParams.get('jibun_start') || '').trim(),
      jibun_end: (searchParams.get('jibun_end') || '').trim(),
      building_name: (searchParams.get('building_name') || '').trim(),
      building_id: parseInt(searchParams.get('building_id') || '0', 10) || null,
      // sort 2차 tiebreaker
      sort2: (searchParams.get('sort2') || 'none').trim(),
    };
    // A.1 단계: v3 param 사용 안 함 (TS 미사용 경고 회피)
    void v3;

    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    let scopeUid: string | null = null;

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
      if (!scopeUid) scope = 'all';
    }

    const from = (page - 1) * size;
    const to = from + size - 1;

    const wantCount = page === 1;
    let q1: any = supabase
      .from('listings')
      .select(SELECT_FIELDS, wantCount ? { count: 'exact' } : undefined)
      .order('created_at', { ascending, nullsFirst: false })
      .range(from, to);

    // scope filter
    if (scope === 'mine' && scopeUid) q1 = q1.eq('created_by', scopeUid);

    // ★ keyword search — address, building_name, dong OR ilike
    if (q) {
      const escaped = q.replace(/[%_]/g, '\\$&');
      q1 = q1.or([
        'address.ilike.%' + escaped + '%',
        'address_detail.ilike.%' + escaped + '%',
        'building_name.ilike.%' + escaped + '%',
        'dong.ilike.%' + escaped + '%',
      ].join(','));
    }

    // ★ type filter (원룸, 오피스텔, 아파트, ...)
    if (typeFilter && typeFilter !== '전체') {
      q1 = q1.eq('type', typeFilter);
    }

    // ★ deal filter (월세, 전세, 매매)
    if (dealFilter && dealFilter !== '전체') {
      q1 = q1.eq('deal', dealFilter);
    }

    // ★ status filter
    if (statusFilter) {
      q1 = q1.eq('status', statusFilter);
    }

    const { data, error, count } = await q1;
    if (error) {
      return NextResponse.json({
        success: false, error: error.message, _ms: Date.now() - _t0,
      }, { status: 200 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true, data: [], page, size,
        total: count || 0, has_more: false,
        _ms: Date.now() - _t0,
      }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' } });
    }

    const ids = data.map((r: any) => r.id);
    const imageByListing: Record<string, string> = {};
    try {
      const { data: imgs } = await supabase
        .from('listing_images')
        .select('listing_id, url, sort_order')
        .in('listing_id', ids)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .limit(2000);
      if (imgs) {
        for (const im of imgs as any[]) {
          const lid = String(im.listing_id);
          if (!imageByListing[lid] && im.url) imageByListing[lid] = im.url;
        }
      }
    } catch { /* images optional */ }

    const transformed: any[] = [];
    for (const row of data) {
      const imgUrl = imageByListing[String(row.id)];
      transformed.push(slimRow(row, imgUrl));
    }

    const has_more_default = data.length === size;
    const total = wantCount ? (count || 0) : undefined;

    return NextResponse.json({
      success: true, data: transformed, page, size,
      ...(total !== undefined
        ? { total, has_more: total > page * size }
        : { has_more: has_more_default }),
      _ms: Date.now() - _t0,
    }, {
      headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 200 }
    );
  }
}


