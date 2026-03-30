// 스마트 매물 등록 - 공유 타입 정의

interface AddressData {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  sigunguCode: string;
  bcode: string;
  buildingName: string;
  bun: string;
  ji: string;
  sido: string;
  sigungu: string;
  bname: string;
}

interface BuildingInfo {h
  건물명: string;
  주용도: string;
  기타용도: string;
  건물구조: string;
  지붕구조: string;
  대지면적: number;
  건축면적: number;
  연면적: number;
  용적률산정연면적: number;
  건폐율: number;
  용적률: number;
  지상층수: number;
  지하층수: number;
  승용엘리베이터: number;
  비상용엘리베이터: number;
  총주차대수: number;
  옥내기계식주차: number;
  옥내자주식주차: number;
  옥외기계식주차: number;
  옥외자주식주차: number;
  허가일: string;
  착공일: string;
  사용승인일: string;
  대장구분: string;
  대장종류: string;
  도로명주소: string;
  지번주소: string;
  세대수: number;
  호수: number;
  가구수: number;
  층별개요: Array<{ 층번호: string; 층구분: string; 층용도: string; 면적: number }>;
  _raw: Record<string, any>;
}

interface FormData {
  // ── 필수 3항목 ──
  address: string;
  addressDetail: string;
  dong: string;
  deal: string;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  type: string;
  // ── 건축물대장 자동입력 ──
  building_name: string;
  building_purpose: string;
  building_structure: string;
  approval_date: string;
  site_area: number | null;
  total_floor_area: number | null;
  building_coverage_ratio: number | null;
  floor_area_ratio: number | null;
  elevator_count: number | null;
  parking_count: number | null;
  underground_floors: number | null;
  household_count: number | null;
  unit_count: number | null;
  ground_floors: number | null;
  road_address: string;
  jibun_address: string;
  sigungu_code: string;
  bcode: string;
  // ── 세부정보 ──
  area_m2: number | null;
  area_supply_m2: number | null;
  floor_current: string;
  floor_total: string;
  rooms: number | null;
  bathrooms: number | null;
  direction: string;
  heating_type: string;
  maintenance_fee: number | null;
  maintenance_includes: string[];
  move_in_type: string;
  move_in_date: string;
  pet_allowed: boolean;
  parking_available: boolean;
  features: string[];
  // ── AI 생성 ──
  title: string;
  description: string;
  // ── 이미지 ──
  images: string[];
  // ── 좌표 (Kakao Geocoder) ──
  lat: number | null;
  lng: number | null;
  // ── 상태 ──
  status: string;
}

interface UploadedImage {
  file: File;
  preview: string;
  enhanced: string | null;
  isEnhancing: boolean;
}

interface DraftListing {
  id: string;
  formData: FormData;
  buildingInfo: BuildingInfo | null;
  createdAt: string;
  updatedAt: string;
}

declare global {
  interface Window {
    daum: any;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   상수
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PROPERTY_TYPES = ['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라', '상가', '사무실'];
const DEAL_TYPES = ['월세', '전세', '매매'];
const DIRECTIONS = ['동', '서', '남', '북', '동남', '동북', '서남', '서북'];
const HEATING_TYPES = ['개별난방', '중앙난방', '지역난방'];
const MAINTENANCE_OPTIONS = ['수도', '전기', '가스', '인터넷', 'TV', '청소비', '주차비', '엘리베이터유지비'];
const FEATURES_OPTIONS = ['풀옵션', '신축', '역세권', '주차가능', '반려동물', '베란다', '엘리베이터', 'CCTV', '분리수거', '무인택배', '건조기', '세탁기'];

export type { FormData, AddressData, BuildingInfo };

export interface StepProps {
  form: FormData;
  updateForm: (partial: Partial<FormData>) => void;
}

export interface Step1Props extends StepProps {
  addressData: AddressData | null;
  showAddressModal: boolean;
  setShowAddressModal: (v: boolean) => void;
  setCurrentStep: (step: number) => void;
  isStep1Valid: boolean;
  touchedFields: Record<string, boolean>;
  setTouchedFields: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  goToStep2: () => void;
}

export interface Step2Props extends StepProps {
  buildingInfo: BuildingInfo | null;
  buildingLoading: boolean;
  buildingError: string | null;
  buildingRawData: any;
  fetchBuildingLedger: () => void;
  downloadBuildingPdf: () => void;
  setCurrentStep: (step: number) => void;
  addressData: AddressData | null;
}

export interface Step3Props extends StepProps {
  uploadedImages: any[];
  setUploadedImages: React.Dispatch<React.SetStateAction<any[]>>;
  enhancedImages: Record<string, string>;
  setEnhancedImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  imageUploading: boolean;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: (index: number) => void;
  enhanceImage: (index: number) => void;
  dragIndex: number | null;
  setDragIndex: React.Dispatch<React.SetStateAction<number | null>>;
  watermarkEnabled: boolean;
  setWatermarkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentStep: (step: number) => void;
}

export interface Step4Props extends StepProps {
  uploadedImages: any[];
  enhancedImages: Record<string, string>;
  publishListing: (mode: string) => void;
  isPublishing: boolean;
  uploadProgress: number;
  generateDescription: () => void;
  isGenerating: boolean;
  saveDraft: () => void;
  lastSavedAt: string | null;
  setCurrentStep: (step: number) => void;
  validationErrors: string[];
}
