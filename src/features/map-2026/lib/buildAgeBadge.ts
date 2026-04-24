// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-age1 (2026-04-23 p.m.): 카드·슬라이드 패널에서 공통으로 쓰는 뱃지 유틸
//
// 2종 뱃지를 독립적으로 반환한다 — NEW 는 72h 내 등록이면 항상 노출,
// 연식 뱃지는 built_year 기준으로 4단계 (5년/10년/15년/25년).
//
// 설계 결정
//   · 신축 선호 심리 반영: 5년 이내는 "YYYY년 준공" 으로 정확한 연도 노출 —
//     "10년이내" 보다 "2024년 준공" 이 훨씬 강하게 어필됨.
//   · 10년 이내는 "10년이내" (초록 강조) — 대다수 매물이 여기 해당
//   · 15년 이내는 "15년이내" (앰버) — 주의 단계 아님, 참고
//   · 25년 이내는 "25년이내" (회색) — 중립
//   · 25년 초과는 표시하지 않음 (뱃지 자체 없음 → 약점 노출 회피)
//
// NEW 판정
//   · created_at 이 지금으로부터 72h (3일) 이내 → NEW 뱃지
//   · updated_at 아닌 created_at 기준 — "재등록" 은 NEW 가 아님
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AgeBadgeTone = 'newest' | 'emerald' | 'amber' | 'gray';

export type AgeBadge = {
  text: string;
  tone: AgeBadgeTone;
};

const NEW_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h

/** 72h 이내 등록된 매물이면 NEW 뱃지 */
export function isNewListing(created_at: string | Date | null | undefined): boolean {
  if (!created_at) return false;
  const t = new Date(created_at).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < NEW_WINDOW_MS;
}

/** 건축 연식 뱃지 — 5년이내는 정확한 연도, 그 외는 N년이내 구간 */
export function buildAgeBadge(built_year: string | null | undefined): AgeBadge | null {
  if (!built_year) return null;
  const year = parseInt(String(built_year).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return null;
  const now = new Date().getFullYear();
  const age = now - year;
  if (age < 0) return { text: `${year}년 준공`, tone: 'newest' };
  if (age <= 5) return { text: `${year}년 준공`, tone: 'newest' };
  if (age <= 10) return { text: '10년이내', tone: 'emerald' };
  if (age <= 15) return { text: '15년이내', tone: 'amber' };
  if (age <= 25) return { text: '25년이내', tone: 'gray' };
  return null; // 25년 초과 — 뱃지 숨김
}

/** NEW + 연식 뱃지 조합 */
export function buildListingBadges(opts: {
  built_year: string | null | undefined;
  created_at: string | Date | null | undefined;
}): { isNew: boolean; age: AgeBadge | null } {
  return {
    isNew: isNewListing(opts.created_at),
    age: buildAgeBadge(opts.built_year),
  };
}
