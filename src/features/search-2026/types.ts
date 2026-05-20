/**
 * search-2026 — /search 현대식 재구축 데이터 타입 (P1 데이터 계층)
 *
 * 레거시 content.js(13,776줄) + 패치 84개를 대체하는 통합 React 구현의 기반.
 * 로드맵: ★search_현대식_재구축_로드맵.md
 * ★원칙 0: UI/디자인은 레거시 /search 와 픽셀 동일하게 재현 — 변경 금지.
 */

/** 매물 1건 — /api/listings · /api/admin/listings 응답을 포괄하는 느슨한 타입 */
export interface SearchListing {
  id: number;
  type?: string | null;
  type_normalized?: string | null;
  deal?: string | null;            // 월세 · 전세 · 매매 · 전월세
  address?: string | null;
  address_detail?: string | null;
  dong?: string | null;
  gu?: string | null;
  building_name?: string | null;
  title?: string | null;
  area_m2?: number | null;
  area_supply_m2?: number | null;
  area_pyeong?: string | number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  maintenance_fee?: number | null;
  status?: string | null;          // 공개 · 비공개 · 계약중 · 완료
  source_site?: string | null;     // onhouse · gongsilclub
  lat?: number | null;
  lng?: number | null;
  built_year?: string | null;
  registered_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  road_address?: string | null;
  images?: Array<{ url: string }>;
  listing_images?: Array<{ url: string }>;
  thumb_url?: string | null;
  has_video?: boolean;
  ai_generated_fields?: string[];
  is_problematic?: boolean;
  [k: string]: unknown;
}

/** /search 필터 상태 — 레거시 필터 패널의 모든 항목을 1:1 대응 */
export interface SearchFilters {
  q?: string;                      // 통합 검색어
  region?: string;                 // 시/도 (전국·서울·경기 …)
  type?: string;                   // 원룸·오피스텔·아파트·사무실·상가·빌라·토지
  deal?: string;
  rooms?: string;                  // 방갯수
  roomShape?: string;              // 룸형태 (오픈형·분리형·복층형 …)
  floorType?: string;              // 층구분 (지상·지하·반지하·옥탑·단독)
  builtYear?: string;              // 준공년도
  parking?: string;                // 주차대수
  minArea?: number; maxArea?: number;
  minPrice?: number; maxPrice?: number;
  minDeposit?: number; maxDeposit?: number;
  minMonthly?: number; maxMonthly?: number;
  options?: string[];              // 추가필터 (건물사진·내부사진·주차가능·EV·금액네고 …)
  keyword?: string;                // 특이사항 키워드
  scope?: 'all' | 'mine';
  sort?: string;                   // created_desc · price_asc · price_desc · area_desc
}

/** 페이지네이션 응답 */
export interface SearchPage {
  listings: SearchListing[];
  total: number;
  page: number;
  perPage: number;
}

export const DEFAULT_FILTERS: SearchFilters = { scope: 'all', sort: 'created_desc' };
export const DEFAULT_PER_PAGE = 100;
