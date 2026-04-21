// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// filterVisibility — 카테고리별 필터 노출/디밍 규칙 중앙 집중
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 원칙
//   1) 한 카테고리에서 무의미한 필터는 "숨김" (애초에 렌더 안 함)
//   2) 유의미하지만 현재 선택 맥락에서 쓸모 없을 것 같은 필터는 "디밍" (opacity-40)
//   3) 모든 카테고리에 공통인 필터는 "항상 노출"
//
//   → UI 컴포넌트는 이 테이블만 참조하면 되고, 새 카테고리/필터가 생겨도
//     여기서 한 번만 수정하면 전체 일관성이 유지됨.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { PropertyCategory, CommercialPurpose, FilterState } from '../store';

// 모든 개별 필터 slot 의 식별자 (UI 레벨)
export type FilterSlot =
  // 전역
  | 'deals'
  | 'hasImages'
  | 'priceRange'
  | 'areaRange'
  // 주거 전용
  | 'rooms'
  | 'newBuild'
  | 'propertyTypes'
  | 'pet'
  // 주거 + 상가/사무실 공통
  | 'nearStation'
  | 'parking'
  | 'elevator'
  // 상가/사무실 전용
  | 'retailFloor1'         // 1층
  | 'cornerLot'            // 코너
  | 'efficiencyRatio'      // 전용률
  // 토지 전용
  | 'landType'             // 대지/전/답/임야/잡종지
  | 'roadAccess'           // 도로 접함
  | 'zoneChangeable'       // 지목 변경 가능
  | 'developable'          // 개발 가능
  // 투자 전용
  | 'yieldMin'             // 수익률 하한
  | 'vacancyRate'          // 공실률
  | 'leaseTransfer'        // 임대차 승계
  | 'remodelable';         // 리모델링 가능

// 카테고리별 "보이는" 슬롯 화이트리스트
// (여기 없는 슬롯은 해당 카테고리에서 아예 렌더 안 됨)
export const VISIBLE_SLOTS: Record<PropertyCategory, FilterSlot[]> = {
  residence: [
    'deals', 'hasImages', 'priceRange', 'areaRange',
    'rooms', 'newBuild', 'propertyTypes', 'pet',
    'nearStation', 'parking', 'elevator',
  ],
  retail_office: [
    'deals', 'hasImages', 'priceRange', 'areaRange',
    'nearStation', 'parking', 'elevator',
    'retailFloor1', 'cornerLot', 'efficiencyRatio',
  ],
  land: [
    'deals', 'hasImages', 'priceRange', 'areaRange',
    'landType', 'roadAccess', 'zoneChangeable', 'developable',
  ],
  investment: [
    'deals', 'hasImages', 'priceRange', 'areaRange',
    'yieldMin', 'vacancyRate', 'leaseTransfer', 'remodelable',
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 예측 디밍 (Predictive Dimming)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상가/사무실 탭에서 "용도"를 고르면, 그 용도와 무관한 세부 칩은 흐릿하게.
// 예: 🤝 공유오피스 선택 → retailFloor1(1층), cornerLot(코너) 는 무의미 → 디밍.
//
// 빈 배열 = 디밍 대상 없음 (용도 미선택 시 = 모두 밝음)
export const DIMMING_BY_PURPOSE: Record<CommercialPurpose, FilterSlot[]> = {
  retail:           [],                                      // 상가는 모든 칩이 유의미
  office:           ['retailFloor1', 'cornerLot'],           // 사무실은 1층·코너 덜 중요
  knowledge_center: ['retailFloor1', 'cornerLot'],           // 지산도 비슷
  coworking:        ['retailFloor1', 'cornerLot', 'parking', 'efficiencyRatio'], // 공유오피스는 대부분 자체 편의 포함
  mixed_use:        [],                                      // 복합은 다 유의미
};

// 슬롯이 "보여야 하는지" (VISIBLE_SLOTS 조회)
export function isSlotVisible(slot: FilterSlot, category: PropertyCategory): boolean {
  return VISIBLE_SLOTS[category].includes(slot);
}

// 슬롯이 "디밍되어야 하는지" (용도 선택 기반)
// — 용도 미선택 시 디밍 0 (모두 밝음)
// — 용도 여러 개 선택 시: 교집합만 디밍 (한 용도라도 해당 칩이 유의미하면 밝게 유지)
export function isSlotDimmed(slot: FilterSlot, purposes: CommercialPurpose[]): boolean {
  if (purposes.length === 0) return false;
  return purposes.every((p) => DIMMING_BY_PURPOSE[p].includes(slot));
}

// 편의 헬퍼: 현재 FilterState 기준으로 (visible, dimmed) 를 한 번에
export function slotStatus(slot: FilterSlot, filter: FilterState): {
  visible: boolean;
  dimmed: boolean;
} {
  const visible = isSlotVisible(slot, filter.category);
  const dimmed = filter.category === 'retail_office'
    ? isSlotDimmed(slot, filter.purposes)
    : false;
  return { visible, dimmed };
}

// 활성 필터 개수 계산 (ActiveFilterPills 의 뱃지용)
// — category 는 항상 기본값이 있으므로 세지 않음
// — purposes 는 상가/사무실 탭에서만 집계
export function countActiveFilters(filter: FilterState): number {
  let n = 0;
  if (filter.deals.length) n += filter.deals.length;
  if (filter.hasImages) n += 1;
  if (filter.minPrice != null || filter.maxPrice != null) n += 1;
  if (filter.minDeposit != null || filter.maxDeposit != null) n += 1;
  if (filter.minMonthly != null || filter.maxMonthly != null) n += 1;
  if (filter.minArea != null || filter.maxArea != null) n += 1;

  // 카테고리별 조건부 집계
  if (filter.category === 'residence') {
    n += filter.rooms.length;
    n += filter.propertyTypes.length;
    if (filter.newBuildYears != null) n += 1;
    if (filter.features.includes('반려동물')) n += 1;
  }
  if (filter.category === 'retail_office') {
    n += filter.purposes.length;
  }
  // 공통 (주거 + 상가/사무실)
  if (filter.category === 'residence' || filter.category === 'retail_office') {
    if (filter.nearStation != null) n += 1;
    if (filter.features.includes('주차')) n += 1;
    if (filter.features.includes('엘리베이터')) n += 1;
  }

  return n;
}
