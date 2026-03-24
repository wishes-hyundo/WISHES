export type ListingType = '원룸' | '투룸' | '쓰리룸' | '오피스텔' | '아파트' | '상가' | '사무실';
export type DealType = '전세' | '월세' | '매매';
export type ListingStatus = '가용' | '계약중' | '계약완료';
export type ContactStatus = '접수' | '처리중' | '완료';

export interface Listing {
  id: number;
  title: string;
  type: ListingType;
  deal: DealType;
  deposit: number;
  monthly: number | null;
  price: number | null;
  area: number;
  floor: string;
  address: string;
  dong: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  available: boolean;
  availableDate: string | null;
  built: string | null;
  parking: boolean;
  elevator: boolean;
  pet: boolean;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  images?: ListingImage[];
  features?: string[];
}

export interface ListingImage {
  id: number;
  listingId: number;
  url: string;
  alt: string | null;
  order: number;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  listingId: number | null;
  status: ContactStatus;
  createdAt: string;
}

export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}

export interface FormattedPrice {
  label: string;
  main: string;
  sub?: string;
}
