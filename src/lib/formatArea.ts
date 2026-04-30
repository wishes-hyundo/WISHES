// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-G2-AREA: 면적 표시 폴백 함수 (사장님 명령 2026-04-30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사장님 명령:
//   "면적 정보 부족해도 광고 진행. 사용자 UI 부정적 표시 X."
//   "건축물대장에도 정보 없는 매물 존재 — 절대 확인 불가도 광고 X 비공개"
//
// 폴백 우선순위:
//   1. area_supply_m2 > area_m2  → "전용 23.5㎡ (7.1평) / 공급 31.2㎡"
//   2. area_m2 > 0               → "23.5㎡ (7.1평)"
//   3. area_m2 = 0 또는 NULL     → "면적 문의"
//
// 절대 X (마케팅 손실):
//   - "면적 0㎡" / "면적 미정" / "쪼갬 의심" 등 부정적 표시
//   - area_split_suspected 는 admin UI 만 표시 (사용자 UI 차단)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ListingAreaFields {
  area_m2?: number | string | null;
  area_supply_m2?: number | string | null;
}

/**
 * 매물 면적을 사용자 친화적으로 포맷.
 *
 * @example
 * formatArea({ area_m2: 23.5, area_supply_m2: 31.2 })
 *   → "전용 23.5㎡ (7.1평) / 공급 31.2㎡ (9.4평)"
 *
 * formatArea({ area_m2: 23.5, area_supply_m2: 23.5 })
 *   → "23.5㎡ (7.1평)"
 *
 * formatArea({ area_m2: 0 })
 *   → "면적 문의"
 */
export function formatArea(listing: ListingAreaFields): string {
  const m2 = toNumber(listing.area_m2);
  const supply = toNumber(listing.area_supply_m2);

  // 1. 면적 모름 → 마케팅 친화 폴백
  if (m2 === null || m2 <= 0) {
    return '면적 문의';
  }

  const py = (m2 / 3.3058).toFixed(1);

  // 2. 공급면적 > 전용면적 (아파트/오피스텔/주상복합)
  if (supply !== null && supply > m2) {
    const supplyPy = (supply / 3.3058).toFixed(1);
    return `전용 ${m2.toFixed(1)}㎡ (${py}평) / 공급 ${supply.toFixed(1)}㎡ (${supplyPy}평)`;
  }

  // 3. 전용면적만 (빌라/주택/상가/사무실)
  return `${m2.toFixed(1)}㎡ (${py}평)`;
}

/**
 * 짧은 표시 (매물 카드/목록용 — 공간 제약).
 *
 * @example
 * formatAreaShort({ area_m2: 23.5 }) → "23.5㎡"
 * formatAreaShort({ area_m2: 0 }) → "문의"
 */
export function formatAreaShort(listing: ListingAreaFields): string {
  const m2 = toNumber(listing.area_m2);
  if (m2 === null || m2 <= 0) return '문의';
  return `${m2.toFixed(1)}㎡`;
}

/**
 * 평수만 표시 (간단 카드용).
 *
 * @example
 * formatAreaPyeong({ area_m2: 23.5 }) → "7.1평"
 * formatAreaPyeong({ area_m2: 0 }) → "문의"
 */
export function formatAreaPyeong(listing: ListingAreaFields): string {
  const m2 = toNumber(listing.area_m2);
  if (m2 === null || m2 <= 0) return '문의';
  return `${(m2 / 3.3058).toFixed(1)}평`;
}

/**
 * 면적 정보 가용성 (조건부 UI 렌더링 시 사용).
 */
export function hasArea(listing: ListingAreaFields): boolean {
  const m2 = toNumber(listing.area_m2);
  return m2 !== null && m2 > 0;
}

// ────────────────────────────────────────
// 내부 helper
// ────────────────────────────────────────
function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
