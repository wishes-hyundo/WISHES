/**
 * search-2026 — /search 현대식 재구축 데이터 타입 (P1 데이터 계층)
 *
 * 레거시 content.js(13,776줄) + 패치 91개를 대체하는 통합 React 구현의 기반.
 * 기준 문서: ★search_완전기능명세서.md (레거시 전 기능 parity 체크리스트)
 * 로드맵: ★search_현대식_재구축_로드맵.md
 */

/** 매물 1건 — /api/admin/listings/page · /api/admin/listings/[id] 응답 포괄 타입 */
export interface SearchListing {
  id: number;
  type?: string | null;
  deal?: string | null;            // 월세 · 전세 · 매매 · 전월세
  status?: string | null;          // 공개 · 비공개 · 계약중 · 계약완료
  title?: string | null;
  address?: string | null;
  address_detail?: string | null;
  dong?: string | null;
  building_name?: string | null;
  building_dong?: string | null;
  building_ho?: string | null;
  road_address?: string | null;
  area_m2?: number | null;
  area_supply_m2?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  deposit_jeonse?: number | null;  // 복합거래 — 전세 옵션 보증금
  monthly_alt?: number | null;     // 복합거래 — 월세 옵션 월세
  deposit_alt?: number | null;     // 복합거래 — 월세 옵션 보증금
  maintenance_fee?: number | null;
  maintenance_includes?: string[] | null;  // 관리비 포함 항목 (수도·인터넷 등)
  parking_spaces?: number | null;
  options?: string | string[] | null;       // 옵션·특징
  parking?: string | null;
  elevator?: boolean | string | null;
  pet?: boolean | string | null;
  balcony?: boolean | string | null;
  full_option?: boolean | string | null;
  loan_available?: boolean | string | null;
  available_date?: string | null;
  available_from?: string | null;
  built_year?: string | null;
  business_type?: string | null;
  goodwill_fee?: number | null;
  station_name?: string | null;
  station_distance?: number | null;
  lat?: number | null;
  lng?: number | null;
  source_site?: string | null;     // onhouse · gongsilclub · (자체매물=없음)
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  last_verified_at?: string | null;
  building_info?: Record<string, unknown> | null;
  listing_images?: Array<{ url?: string; hero_url?: string }>;
  thumbnail_url?: string | null;
  [k: string]: unknown;
}

/**
 * /search 필터 상태 — 레거시 필터 패널 전 항목 1:1 대응.
 * (명세서 §2 참조. /api/admin/listings/page 의 v3 param 집합과 매핑.)
 */
export interface SearchFilters {
  q?: string;                      // 통합 검색어 (주소·건물명·동·매물번호)
  regions?: string[];              // 선택 시/도+구  예: "서울 강남구"
  dongs?: string[];                // 선택 동       예: "강남구 역삼동"
  types?: string[];                // 매물종류 다중 (원룸·오피스텔·아파트·사무실·상가·빌라·토지)
  deals?: string[];                // 거래구분 다중 (월세·전세·전월세·매매)
  statuses?: string[];             // 상태 다중 (공개·비공개·계약중·계약완료)
  roomCounts?: string[];           // 방갯수 다중 (1개·1.5개·1-2개·2개·2-3개·3개)
  roomShape?: string;              // 룸형태 단일 (오픈형·분리형·복층형·원룸원거실·세미분리형)
  floorType?: string;              // 층구분 단일 (지상·지하·반지하·옥탑·단독)
  builtYearMin?: number;           // 준공년도 (해당 연도 이후)
  builtYearMax?: number;           // 준공년도 (해당 연도 이전 — 구축 검색)
  bathroomsMin?: number;           // 욕실 N개 이상
  parkingMin?: number;             // 주차대수 (N대 이상)
  minDeposit?: number; maxDeposit?: number;
  minMonthly?: number; maxMonthly?: number;
  includeMgmt?: boolean;           // 월세가에 관리비 포함
  minSale?: number; maxSale?: number;        // 매매가
  minBase?: number; maxBase?: number;        // 기준가
  minArea?: number; maxArea?: number;        // 전용면적
  areaUnit?: 'm2' | 'pyeong';
  minSupply?: number; maxSupply?: number;    // 공급면적
  supplyUnit?: 'm2' | 'pyeong';
  options?: SearchOptionKey[];     // 추가필터 체크박스
  jibunStart?: string; jibunEnd?: string;    // 지번 범위
  buildingName?: string;           // 건물명 검색
  buildingId?: number;             // 건물ID 검색
  scope?: 'all' | 'mine';
  sort?: SearchSort;               // 1차 정렬
  sort2?: string;                  // 2차 정렬 (tiebreaker)
}

/** 추가필터 체크박스 키 (명세서 §2-4) — API boolean param 으로 직렬화 */
export type SearchOptionKey =
  | 'building_photo' | 'interior_photo' | 'video' | 'short_term'
  | 'parking_available' | 'empty_now' | 'balcony'
  | 'no_full_option' | 'full_option_only' | 'elevator'
  | 'price_nego' | 'loan_available' | 'pet_ok';

/** 정렬 (명세서 §3-1 — /api/admin/listings/page SORT_MAP 과 동일) */
export type SearchSort =
  | 'latest' | 'oldest' | 'views'
  | 'price_low' | 'price_high' | 'area_low' | 'area_high';

/** 페이지네이션 응답 */
export interface SearchPage {
  listings: SearchListing[];
  total: number;        // page 1 에서만 정확 (서버가 page1 에서만 count)
  page: number;
  perPage: number;
  hasMore: boolean;
  ms?: number;
}

export const DEFAULT_FILTERS: SearchFilters = { scope: 'all', sort: 'latest' };
export const DEFAULT_PER_PAGE = 100;

/**
 * 필터 옵션 값 — 레거시 코드에서 추출(명세서 §2). 재구축 UI는 이 상수를 단일 출처로 사용.
 * '전체'는 UI 표기용, 필터 미적용을 의미.
 */
export const FILTER_OPTIONS = {
  types: ['전체', '원룸', '오피스텔', '아파트', '사무실', '상가', '빌라', '토지'],
  deals: ['전체', '월세', '전세', '전월세', '매매'],
  statuses: ['공개', '비공개', '계약중', '계약완료'],
  roomCounts: ['전체', '1개', '1.5개', '1-2개', '2개', '2-3개', '3개', '3개 이상', '4개 이상'],
  roomShapes: ['전체', '오픈형', '분리형', '복층형', '원룸원거실', '세미분리', '전층사용', '일부층사용'],
  floorTypes: ['전체', '지상', '지하', '반지하', '옥탑', '단독'],
  builtYears: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2015, 2010, 2005, 2000],
  builtYearsBefore: [2000, 1990],
  bathrooms: ['전체', '1개 이상', '2개 이상', '3개 이상'],
  parkingMins: [1, 2, 3, 4, 5],
  sorts: [
    { key: 'latest', label: '최신순' },
    { key: 'views', label: '조회순' },
    { key: 'price_low', label: '가격↑' },
    { key: 'price_high', label: '가격↓' },
    { key: 'area_low', label: '면적↑' },
    { key: 'area_high', label: '면적↓' },
  ],
  options: [
    { key: 'building_photo', label: '건물사진있음' },
    { key: 'interior_photo', label: '내부사진있음' },
    { key: 'video', label: '동영상있음' },
    { key: 'short_term', label: '단기임대' },
    { key: 'parking_available', label: '주차가능' },
    { key: 'empty_now', label: '현재공실' },
    { key: 'balcony', label: '베란다' },
    { key: 'no_full_option', label: '풀옵션제외' },
    { key: 'full_option_only', label: '풀옵션만보기' },
    { key: 'elevator', label: 'E/V' },
    { key: 'price_nego', label: '금액네고' },
    { key: 'loan_available', label: '전세대출가능' },
    { key: 'pet_ok', label: '반려동물 가능' },
  ],
} as const;

/** 시/도 + 자치구 (명세서 §2-1 — content.js REGIONS) */
export const REGIONS: Record<string, string[]> = {
  전국: [],
  서울: ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  경기: ['가평군','고양시','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시','수원시','순천시','시흥시','안산시','안성시','안양시','양주시','양평군','여주시','연천군','오산시','용인시','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시'],
  인천: ['강화군','계양구','남동구','남구','동구','미추홀구','부평구','서구','연수구','옹진군','중구'],
  강원: ['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  대전: ['대덕구','동구','서구','유성구','중구'],
  세종: [],
  충남: ['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시','청양군','태안군','홍성군'],
  충북: ['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시','충주시'],
  부산: ['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구'],
  울산: ['남구','동구','북구','중구','울주군'],
  경남: ['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시','통영시','하동군','함안군','함양군','합천군'],
  경북: [],
};
