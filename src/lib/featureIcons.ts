// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// featureIcons — 옵션/시설 문자열 → lucide 아이콘 매핑
//   MapListingPanel / ListingDetailClient 양쪽에서 재사용.
//   features[] (JSONB) 에 들어온 한글 키워드를 내부시설·보안 2그룹으로 분류하고
//   각각에 대응하는 lucide 아이콘 컴포넌트를 반환한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Armchair, Shirt, Package, Footprints, Refrigerator, WashingMachine,
  Wind, Bath, Droplet, Flame, Microwave, AirVent,
  Shield, Video, Phone, Camera, Lock, ArrowUpDown, BellRing,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FeatureSpec {
  label: string;
  icon: LucideIcon;
  keys: string[]; // DB 에 들어올 수 있는 alias 목록 (대소문자·공백 무시)
}

// ── 내부 시설 (네이버 /원룸·투룸 상세 벤치마크 12종) ──
export const INTERIOR_FEATURES: FeatureSpec[] = [
  { label: '책상',       icon: Armchair,       keys: ['책상', 'desk'] },
  { label: '옷장',       icon: Shirt,          keys: ['옷장', '장롱', 'wardrobe'] },
  { label: '붙박이장',   icon: Package,        keys: ['붙박이장', '붙박이', 'built-in closet'] },
  { label: '신발장',     icon: Footprints,     keys: ['신발장', 'shoe rack'] },
  { label: '냉장고',     icon: Refrigerator,   keys: ['냉장고', 'refrigerator', 'fridge'] },
  { label: '세탁기',     icon: WashingMachine, keys: ['세탁기', 'washer', 'washing machine'] },
  { label: '건조기',     icon: Wind,           keys: ['건조기', 'dryer'] },
  { label: '샤워부스',   icon: Bath,           keys: ['샤워부스', '샤워', 'shower', '욕조'] },
  { label: '싱크대',     icon: Droplet,        keys: ['싱크대', 'sink'] },
  { label: '인덕션',     icon: Flame,          keys: ['인덕션', '가스레인지', '레인지', 'induction', 'stove', 'cooktop'] },
  { label: '전자레인지', icon: Microwave,      keys: ['전자레인지', 'microwave'] },
  { label: '에어컨',     icon: AirVent,        keys: ['에어컨', '천장에어컨', '냉방', 'air conditioner', 'ac'] },
];

// ── 보안 및 기타 (7종) ──
export const SECURITY_FEATURES: FeatureSpec[] = [
  { label: '경비원',     icon: Shield,      keys: ['경비원', '경비', '관리인', 'guard'] },
  { label: '비디오폰',   icon: Video,       keys: ['비디오폰', 'video phone'] },
  { label: '인터폰',     icon: Phone,       keys: ['인터폰', 'intercom'] },
  { label: 'CCTV',       icon: Camera,      keys: ['cctv', '감시카메라'] },
  { label: '현관보안',   icon: Lock,        keys: ['현관보안', '현관', '도어락', '디지털도어락', 'door lock'] },
  { label: '엘리베이터', icon: ArrowUpDown, keys: ['엘리베이터', 'elevator'] },
  { label: '화재경보',   icon: BellRing,    keys: ['화재경보', '화재감지기', '화재경보기', 'fire alarm'] },
];

/**
 * features[] 배열에 해당 spec 의 key 가 매칭되는지 확인.
 * 대소문자/공백/특수문자 무시.
 */
function normalize(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, '').trim();
}

export function hasFeature(features: string[] | null | undefined, spec: FeatureSpec): boolean {
  if (!Array.isArray(features) || features.length === 0) return false;
  const set = new Set(features.map(normalize));
  return spec.keys.some((k) => set.has(normalize(k)));
}

/**
 * 추가적으로 listing 의 bool 필드(parking/elevator/pet/balcony/full_option)도 합쳐
 * "이 매물에 존재하는 feature" 전체를 평가할 수 있도록 도와주는 헬퍼.
 * bool 필드가 true 면 해당 spec 도 true 로 간주.
 */
export function hasFeatureWithBools(
  features: string[] | null | undefined,
  spec: FeatureSpec,
  bools: { elevator?: boolean; full_option?: boolean } = {}
): boolean {
  if (hasFeature(features, spec)) return true;
  // 대표 bool → feature 매핑
  if (spec.label === '엘리베이터' && bools.elevator) return true;
  // 풀옵션이면 기본 가전·가구는 자동 포함 (네이버 벤치마크)
  if (bools.full_option) {
    const FULL_OPTION_INCLUDES = ['책상', '옷장', '냉장고', '세탁기', '에어컨'];
    if (FULL_OPTION_INCLUDES.includes(spec.label)) return true;
  }
  return false;
}
