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
    // ★ A.2.10: sort 옵션 확장
    //   latest/newest = created_at DESC
    //   oldest = created_at ASC
    //   views = views DESC
    //   price_low = price ASC (note: base_price deal-aware 는 stored function 으로)
    //   price_high = price DESC
    //   area_low/high = area_m2 ASC/DESC
    const SORT_MAP: Record<string, { col: string; asc: boolean }> = {
      latest: { col: 'created_at', asc: false },
      newest: { col: 'created_at', asc: false },
      oldest: { col: 'created_at', asc: true },
      views: { col: 'views', asc: false },
      price_low: { col: 'price', asc: true },
      price_high: { col: 'price', asc: false },
      area_low: { col: 'area_m2', asc: true },
      area_high: { col: 'area_m2', asc: false },
    };
    const sortConfig = SORT_MAP[sort] || SORT_MAP.latest;
    const ascending = sortConfig.asc;
    const sortCol = sortConfig.col;

    // ★ v2 — 검색/필터 params
    const q = (searchParams.get('q') || '').trim();
    const typeFilter = (searchParams.get('type') || '').trim();
    const dealFilter = (searchParams.get('deal') || '').trim();
    const statusFilter = (searchParams.get('status') || '').trim();

    // [Critical fix 2026-05-16 Step 3] safe int/float parsers — 0 을 valid 한 값으로 허용
    //   이전 버그: parseInt('0', 10) || null = null  (0 이 falsy 라 무효화)
    //   영향: min_deposit=0, min_monthly=0, min_area=0 등 silent fail
    //   fix: null/empty 만 명시적으로 null 반환, 0 은 그대로 0 반환
    const parseIntSafe = (raw: string | null): number | null => {
      if (raw === null || raw.trim() === '') return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    };
    const parseFloatSafe = (raw: string | null): number | null => {
      if (raw === null || raw.trim() === '') return null;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    };

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
      min_deposit: parseIntSafe(searchParams.get('min_deposit')),
      max_deposit: parseIntSafe(searchParams.get('max_deposit')),
      min_monthly: parseIntSafe(searchParams.get('min_monthly')),
      max_monthly: parseIntSafe(searchParams.get('max_monthly')),
      include_mgmt: searchParams.get('include_mgmt') === '1',
      min_sale: parseIntSafe(searchParams.get('min_sale')),
      max_sale: parseIntSafe(searchParams.get('max_sale')),
      min_base: parseIntSafe(searchParams.get('min_base')),
      max_base: parseIntSafe(searchParams.get('max_base')),
      // 면적 (m² 또는 평)
      min_area: parseFloatSafe(searchParams.get('min_area')),
      max_area: parseFloatSafe(searchParams.get('max_area')),
      area_unit: (searchParams.get('area_unit') || 'm2').trim(),
      min_supply: parseFloatSafe(searchParams.get('min_supply')),
      max_supply: parseFloatSafe(searchParams.get('max_supply')),
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
      building_id: parseIntSafe(searchParams.get('building_id')),
      // sort 2차 tiebreaker
      sort2: (searchParams.get('sort2') || 'none').trim(),
    };
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
      .order(sortCol, { ascending, nullsFirst: false })
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

    // ★ type filter — v3 다중 우선, v2 단일 fallback
    if (v3.types.length > 0) {
      q1 = q1.in('type', v3.types);
    } else if (typeFilter && typeFilter !== '전체') {
      q1 = q1.eq('type', typeFilter);
    }

    // ★ deal filter — v3 다중 우선, v2 단일 fallback
    if (v3.deals.length > 0) {
      q1 = q1.in('deal', v3.deals);
    } else if (dealFilter && dealFilter !== '전체') {
      q1 = q1.eq('deal', dealFilter);
    }

    // ★ status filter — v3 다중 우선, v2 단일 fallback
    //   [Critical fix 2026-05-15] default 로 거래완료/archived 제외 (legacy client 와 일치)
    //   client 가 명시적으로 statuses 보낼 때는 그것 우선
    if (v3.statuses.length > 0) {
      q1 = q1.in('status', v3.statuses);
    } else if (statusFilter) {
      q1 = q1.eq('status', statusFilter);
    } else {
      // default: 공개 + 비공개만 (거래완료 / archived / 중복정리 제외)
      q1 = q1.in('status', ['공개', '비공개']);
    }

    // ★ A.2.2: floor_type (지상/지하/반지하/옥탑/단독) — text regex
    if (v3.floor_type && v3.floor_type !== '전체') {
      switch (v3.floor_type) {
        case '지상':
          q1 = q1.not('floor_current', 'ilike', '%지하%')
                 .not('floor_current', 'ilike', '%반%')
                 .not('floor_current', 'ilike', 'B%');
          break;
        case '지하':
          q1 = q1.or('floor_current.ilike.%지하%,floor_current.ilike.B%');
          break;
        case '반지하':
          q1 = q1.or('floor_current.ilike.%반지하%,floor_current.ilike.%반%');
          break;
        case '옥탑':
          q1 = q1.or('floor_current.ilike.%옥%,floor_current.ilike.%PH%,floor_current.ilike.%penthouse%');
          break;
        case '단독':
          q1 = q1.ilike('floor_current', '%단독%');
          break;
      }
    }

    // ★ A.2.3: room_counts (다중) — 1개/1.5개/1-2개/2개/2-3개/3개
    //   rooms numeric column. 다중 선택은 .or() chain 으로.
    if (v3.room_counts.length > 0) {
      const roomConds: string[] = [];
      for (const rc of v3.room_counts) {
        switch (rc) {
          case '1개': roomConds.push('rooms.eq.1'); break;
          case '1.5개': roomConds.push('rooms.eq.1.5'); break;
          case '1-2개': roomConds.push('and(rooms.gte.1,rooms.lte.2)'); break;
          case '2개': roomConds.push('rooms.eq.2'); break;
          case '2-3개': roomConds.push('and(rooms.gte.2,rooms.lte.3)'); break;
          case '3개': roomConds.push('rooms.eq.3'); break;
        }
      }
      if (roomConds.length > 0) {
        q1 = q1.or(roomConds.join(','));
      }
    }

    // ★ A.2.4: parking_min — parking_spaces gte N
    if (v3.parking_min > 0) {
      q1 = q1.gte('parking_spaces', v3.parking_min);
    }

    // ★ A.2.4b: built_year_min — built_year text 컬럼에서 4자리 추출 gte
    //   built_year 가 text ('2020년', '2020-01-01' 등) 라서 substring 비교 사용
    //   PostgREST 는 directly 함수 호출 불가 — 단순 lexicographic 비교는 'YYYY' 4자리에서 작동
    //   주의: '2020년 5월' 같은 값은 '2020' 으로 시작이라 OK
    if (v3.built_year_min > 0) {
      q1 = q1.gte('built_year', String(v3.built_year_min));
    }

    // ★ A.2.5: 가격 범위 (deposit/monthly/sale_price)
    if (v3.min_deposit != null) q1 = q1.gte('deposit', v3.min_deposit);
    if (v3.max_deposit != null) q1 = q1.lte('deposit', v3.max_deposit);
    if (v3.min_monthly != null) q1 = q1.gte('monthly', v3.min_monthly);
    if (v3.max_monthly != null) q1 = q1.lte('monthly', v3.max_monthly);
    if (v3.min_sale != null) q1 = q1.gte('price', v3.min_sale);
    if (v3.max_sale != null) q1 = q1.lte('price', v3.max_sale);
    // base_price (deal-aware) 는 SQL CASE 가 필요 → PostgREST 어려움. client 처리로 위임.
    // TODO: PostgREST stored function 으로 처리 (Phase A 후반 또는 별도 phase)

    // ★ A.2.6: 면적 범위 (m² / 평 단위 변환)
    //   1 평 = 3.30579 m² — DB 가 m² 저장하므로 평 입력시 m² 로 변환 후 비교
    const PY_TO_M2 = 3.30579;
    const toM2 = (val: number, unit: string) => unit === 'pyeong' ? val * PY_TO_M2 : val;
    if (v3.min_area != null) q1 = q1.gte('area_m2', toM2(v3.min_area, v3.area_unit));
    if (v3.max_area != null) q1 = q1.lte('area_m2', toM2(v3.max_area, v3.area_unit));
    if (v3.min_supply != null) q1 = q1.gte('area_supply_m2', toM2(v3.min_supply, v3.supply_unit));
    if (v3.max_supply != null) q1 = q1.lte('area_supply_m2', toM2(v3.max_supply, v3.supply_unit));

    // ★ A.2.7: boolean checks
    if (v3.parking_available) q1 = q1.eq('parking', true);
    if (v3.empty_now) q1 = q1.eq('status', '공개'); // 현재공실 = status 공개 (사장님 정의)
    if (v3.elevator) q1 = q1.eq('elevator', true);
    if (v3.loan_available) q1 = q1.eq('loan_available', true);
    if (v3.no_full_option) q1 = q1.eq('full_option', false);
    if (v3.full_option_only) q1 = q1.eq('full_option', true);
    // ★ price_nego — [2026-05-15 정밀검수 발견] DB 컬럼 price_nego/negotiable 없음.
    //   활성화하면 PostgREST 422 에러 → 안전하게 skip.
    //   향후 컬럼 추가 시 활성:
    //   if (v3.price_nego) q1 = q1.or('price_nego.eq.true,negotiable.eq.true');
    // (현재 v3.price_nego 받기만 하고 SQL 적용 안 함 — UI 에 옵션은 있지만 데이터 없음)
    // building_photo / interior_photo — listing_images EXISTS 필요 (PostgREST 어려움)
    //   대안: client 가 응답 후 filter (이미 listing_images 정보 응답에 있음)
    //   또는 stored function 으로 처리 (Phase A 후반)

    // ★ A.2.8: 지역 (selected_dongs / selected_regions)
    //   selected_dongs: '시도 동' 형식 (e.g. '서울 역삼동') — address ILIKE
    //   selected_regions: 시도 또는 시도+구 (e.g. '서울', '서울 강남구') — address ILIKE
    //   다중 선택 OR chain
    const escIlike = (str: string) => str.replace(/[%_]/g, '\\$&');
    if (v3.selected_dongs.length > 0) {
      const dongConds: string[] = [];
      for (const d of v3.selected_dongs) {
        const e = escIlike(d.trim());
        if (e) dongConds.push(`address.ilike.%${e.replace(/ /g, '%')}%`);
      }
      if (dongConds.length > 0) q1 = q1.or(dongConds.join(','));
    } else if (v3.selected_regions.length > 0) {
      const regionConds: string[] = [];
      for (const r of v3.selected_regions) {
        const e = escIlike(r.trim());
        if (e) regionConds.push(`address.ilike.%${e}%`);
      }
      if (regionConds.length > 0) q1 = q1.or(regionConds.join(','));
    }

    // ★ A.2.9a: jibun range (지번 범위)
    //   address 의 한 부분이 jibun_start ~ jibun_end 사이인지 확인 어려움 (text)
    //   단순 contains 로 처리 (한 쪽이라도 address 에 들어있으면 매칭)
    if (v3.jibun_start && v3.jibun_end) {
      const e1 = escIlike(v3.jibun_start);
      const e2 = escIlike(v3.jibun_end);
      q1 = q1.or(`address.ilike.%${e1}%,address.ilike.%${e2}%`);
    } else if (v3.jibun_start) {
      q1 = q1.ilike('address', `%${escIlike(v3.jibun_start)}%`);
    } else if (v3.jibun_end) {
      q1 = q1.ilike('address', `%${escIlike(v3.jibun_end)}%`);
    }

    // ★ A.2.9b: building_name (건물명)
    if (v3.building_name) {
      q1 = q1.ilike('building_name', `%${escIlike(v3.building_name)}%`);
    }

    // ★ A.2.9c: building_id (매물ID 직검색)
    if (v3.building_id != null && v3.building_id > 0) {
      q1 = q1.eq('id', v3.building_id);
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


