// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES v2 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 매물 유형
export type ListingType =
  | '원룸' | '투룸' | '쓰리룸' | '오피스텔' | '아파트' | '빌라'
  | '주택' | '상가' | '사무실' | '지식산업센터' | '토지'
  | '사무실/상가'; // 크롤러 레거시 호환

// 거래 유형
export type DealType = '전세' | '월세' | '매매' | '단기';

// 매물 상태
export type ListingStatus = '공개' | '비공개' | '계약중' | '계약완료';

// 문의 상태
export type ContactStatus = '접수' | '처리중' | '완료';

// 매물 인터페이스
export interface Listing {
  id: number;
  title: string;
  type: ListingType;
  deal: DealType;
  deposit: number;
  monthly: number | null;
  price: number | null;
  maintenance_fee?: number;
  maintenance_includes?: string[] | null;
  area_m2: number;
  area_supply_m2?: number | null;
  area_land_m2?: number | null;
  floor_current: string;
  floor_total?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  heating_type?: string | null;
  address: string;
  address_detail?: string | null;
  dong: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  available_date?: string | null;
  built_year?: string | null;
  parking: boolean;
  elevator: boolean;
  pet: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  // 상업용 매물 전용 필드
  business_type?: string | null;
  goodwill_fee?: number | null;
  vat_included?: boolean;
  station_name?: string | null;
  station_distance?: number | null;
  usage_approved?: string | null;
  electric_capacity?: string | null;
  signage_available?: boolean;
  meeting_room?: number | null;
  status: ListingStatus;
  views?: number;
  created_at: string;
  updated_at: string;
  images?: ListingImage[];
  features?: string[];

  // 상업용 업종 정보
  previous_business?: string | null;
  recommended_business?: string | null;
  restricted_business?: string | null;
  parking_spaces?: number | null;
  // 크롤링 출처 정보
  source_site?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  building_name?: string | null;
  contact?: string | null;
  lease_period?: string | null;
  rights_fee?: number | null;

  // Legacy field mappings for backward compatibility
  area?: number;
  floor?: string;
  availableDate?: string | null;
  built?: string | null;
  available?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// 매물 이미지
export interface ListingImage {
  id: number;
  listing_id?: number;
  listingId?: number;
  url: string;
  alt: string | null;
  sort_order?: number;
  order?: number;
  is_thumbnail?: boolean;
  created_at?: string;
}

// 상담 문의
export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  listing_id?: number | null;
  listingId?: number | null;
  listingTitle?: string | null;
  inquiry_type?: string;
  property_type?: string | null;
  preferred_area?: string | null;
  budget_range?: string | null;
  move_date?: string | null;
  business_category?: string | null;
  preferred_floor?: string | null;
  additional_requirements?: string | null;
  status: ContactStatus;
  created_at?: string;
  createdAt?: string;
}

// 지도 바운드 (카카오맵)
export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

// 매물 필터 (네모 벤치마크: 거래·유형·가격·면적·층·방향·옵션·입주일·용도)
export interface ListingFilter {
  deal?: DealType;
  deals?: DealType[]; // 다중 선택
  type?: ListingType;
  types?: ListingType[]; // 다중 선택
  dong?: string;
  // 가격 (단위: 만원)
  minDeposit?: number;
  maxDeposit?: number;
  minMonthly?: number;
  maxMonthly?: number;
  minPrice?: number; // 매매가
  maxPrice?: number;
  // 면적 (단위: ㎡)
  minArea?: number;
  maxArea?: number;
  // 층수 범주
  floorCategory?: 'basement' | 'low' | 'mid' | 'high'; // 지하/저층(1-3)/중층(4-7)/고층(8+)
  // 방향 8방위
  direction?: string; // 남/동/서/북/남동/남서/북동/북서
  // 옵션 (다중 토글)
  options?: {
    fullOption?: boolean;  // 풀옵션
    pet?: boolean;         // 반려동물
    parking?: boolean;     // 주차
    elevator?: boolean;    // 엘리베이터
    balcony?: boolean;     // 발코니
    newBuild?: boolean;    // 신축
  };
  // 입주 가능일
  moveIn?: 'immediate' | 'negotiable' | 'date'; // 즉시/협의/날짜
  moveInDate?: string; // YYYY-MM-DD (moveIn === 'date' 일 때)
  // 상가용
  businessUseable?: boolean;    // 음식점 가능
  goodwillFreeOnly?: boolean;   // 권리금 없음
  status?: ListingStatus;
}

// API 응답 래퍼
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}
