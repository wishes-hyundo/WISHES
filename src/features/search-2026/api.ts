/**
 * search-2026 — API 클라이언트 (P1 데이터 계층)
 *
 * 레거시 패치 v397(서버 페이지네이션)이 쓰던 /api/admin/listings/page 를
 * 타입 안전하게 감싼다. SearchFilters → URLSearchParams 직렬화 단일 지점.
 * 기준: ★search_완전기능명세서.md §3-3, §7.
 */

import type { SearchFilters, SearchListing, SearchPage } from './types';

const PAGE_ENDPOINT = '/api/admin/listings/page';
const DETAIL_ENDPOINT = '/api/admin/listings'; // + /{id}

/** SearchFilters → /api/admin/listings/page 쿼리스트링 (v3 param 집합) */
export function buildListingsParams(
  filters: SearchFilters,
  page: number,
  perPage: number,
): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('size', String(perPage));
  p.set('sort', filters.sort || 'latest');
  if (filters.sort2 && filters.sort2 !== 'none') p.set('sort2', filters.sort2);
  p.set('scope', filters.scope === 'mine' ? 'mine' : 'all');

  const qVal = [filters.q, filters.keyword].map((x) => x?.trim()).filter(Boolean).join(' ');
  if (qVal) p.set('q', qVal);

  // 다중 선택
  if (filters.types?.length) p.set('types', filters.types.join(','));
  if (filters.deals?.length) p.set('deals', filters.deals.join(','));
  if (filters.statuses?.length) p.set('statuses', filters.statuses.join(','));
  if (filters.roomCounts?.length) p.set('room_counts', filters.roomCounts.join(','));

  // 카테고리 단일
  if (filters.floorType && filters.floorType !== '전체') p.set('floor_type', filters.floorType);
  if (filters.parkingMin) p.set('parking_min', String(filters.parkingMin));
  if (filters.builtYearMin) p.set('built_year_min', String(filters.builtYearMin));
  if (filters.builtYearMax) p.set('built_year_max', String(filters.builtYearMax));
  if (filters.roomShape && filters.roomShape !== '전체') p.set('room_shape', filters.roomShape);
  if (filters.bathroomsMin) p.set('bathrooms_min', String(filters.bathroomsMin));

  // 가격 범위 (0 도 유효값 — null/undefined 만 제외)
  const num = (k: string, v?: number) => { if (v != null) p.set(k, String(v)); };
  num('min_deposit', filters.minDeposit); num('max_deposit', filters.maxDeposit);
  num('min_monthly', filters.minMonthly); num('max_monthly', filters.maxMonthly);
  num('min_sale', filters.minSale); num('max_sale', filters.maxSale);
  num('min_base', filters.minBase); num('max_base', filters.maxBase);
  if (filters.includeMgmt) p.set('include_mgmt', '1');

  // 면적
  num('min_area', filters.minArea); num('max_area', filters.maxArea);
  if (filters.areaUnit) p.set('area_unit', filters.areaUnit);
  num('min_supply', filters.minSupply); num('max_supply', filters.maxSupply);
  if (filters.supplyUnit) p.set('supply_unit', filters.supplyUnit);

  // 추가필터 boolean (명세서 §2-4 — API 지원분만 직렬화)
  const API_OPTS = new Set([
    'building_photo', 'interior_photo', 'parking_available', 'empty_now',
    'elevator', 'loan_available', 'no_full_option', 'full_option_only', 'price_nego', 'pet_ok',
  ]);
  for (const opt of filters.options || []) {
    if (API_OPTS.has(opt)) p.set(opt, '1');
  }

  // 지역 (구분자: '|' — 지명에 쉼표 없음)
  if (filters.regions?.length) p.set('selected_regions', filters.regions.join('|'));
  if (filters.dongs?.length) p.set('selected_dongs', filters.dongs.join('|'));

  // 지번 · 건물
  if (filters.jibunStart?.trim()) p.set('jibun_start', filters.jibunStart.trim());
  if (filters.jibunEnd?.trim()) p.set('jibun_end', filters.jibunEnd.trim());
  if (filters.buildingName?.trim()) p.set('building_name', filters.buildingName.trim());
  if (filters.buildingId != null) p.set('building_id', String(filters.buildingId));

  return p;
}

interface PageResponse {
  success?: boolean;
  data?: SearchListing[];
  page?: number;
  size?: number;
  total?: number;
  has_more?: boolean;
  _ms?: number;
  error?: string;
}

/**
 * 매물 페이지 조회. 인증: 세션 쿠키(credentials:'include').
 * 엔드포인트는 verifyAdminAuth — /search swap 시점에 실제 인증과 함께 검증.
 */
export async function fetchSearchListings(
  filters: SearchFilters,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const params = buildListingsParams(filters, page, perPage);
  const res = await fetch(`${PAGE_ENDPOINT}?${params.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(`listings/page ${res.status}`);
  const json: PageResponse = await res.json();
  if (json.success === false) throw new Error(json.error || 'listings/page 실패');
  return {
    listings: json.data || [],
    total: json.total ?? 0,
    page: json.page ?? page,
    perPage: json.size ?? perPage,
    hasMore: json.has_more ?? false,
    ms: json._ms,
  };
}

interface DetailResponse {
  success?: boolean;
  data?: SearchListing;
  listing?: SearchListing;
  error?: string;
}

/** 매물 1건 상세 조회 (모달용 전체 필드) */
export async function fetchListingDetail(
  id: number,
  signal?: AbortSignal,
): Promise<SearchListing> {
  const res = await fetch(`${DETAIL_ENDPOINT}/${id}`, {
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(`listings/${id} ${res.status}`);
  const json: DetailResponse = await res.json();
  if (json.success === false) throw new Error(json.error || `listings/${id} 실패`);
  const listing = json.data || json.listing;
  if (!listing) throw new Error(`listings/${id} 빈 응답`);
  return listing;
}
