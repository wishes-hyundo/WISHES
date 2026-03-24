// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES v2 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 매물 유형
export type ListingType = '원룸' | '투룸' | '쓰리룴' | '오피스텔' | '아파트' | '상가' | '사무실';

// 거래 유형
export type DealType = '전세' | '월세' | '매매';

// 매물 상태
export type ListingStatus = '가용' | '계약중' | '계약완료';

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
  status: ListingStatus;
  views?: number;
  created_at: string;
  updated_at: string;
  images?: ListingImage[];
  features?: string[];

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

// 매물 필터
export interface ListingFilter {
  deal?: DealType;
  type?: ListingType;
  dong?: string;
  minDeposit?: number;
  maxDeposit?: number;
  minMonthly?: number;
  maxMonthly?: number;
  status?: ListingStatus;
}

// API 응답 래퍼
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}

// 가격 포맷 여퍼 타입
export interface FormattedPrice {
  label: string;
  main: string;
  sub?: string;
}
