// ─────────────────────────────────────────────────────────────────────────
// L-crit5 (2026-04-23): AI 제목 주소-누출 방어 — 공용 헬퍼.
//
//   /api/generate-description                      (신규 생성 + 캐시 반환 양쪽)
//   /api/admin/listings/regenerate-titles          (백필 스캔/재생성)
//
//   양쪽이 공용으로 재사용하도록 route.ts 밖 lib 모듈로 분리.
//   (Next.js App Router 는 route.ts 에 HTTP method 가 아닌 named export
//    가 있어도 동작하긴 하지만, 관심사 분리와 회귀 방지 차원.)
// ─────────────────────────────────────────────────────────────────────────

export type SanitizerHints = {
  address?: string | null;
  dong?: string | null;
  gu?: string | null;
  buildingInfo?: string | null;
};

/**
 * 주어진 제목 문자열에서 주소/동/구/건물명/지번/층·호 토큰을 제거해
 * 주소가 누출되지 않은 제목을 반환.
 */
export function sanitizeAiTitle(
  raw: string | null | undefined,
  hints: SanitizerHints,
): string {
  if (!raw) return '';
  let t = String(raw).trim();

  const banned = [hints.gu, hints.dong, hints.address, hints.buildingInfo]
    .map(s => String(s || '').trim())
    .filter(s => s.length >= 2);

  for (const b of banned) {
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(esc, 'g'), '').trim();
  }

  // 일반 한글 동/구/읍/면 접미어 스크럽
  t = t.replace(/[\uAC00-\uD7A3A-Za-z0-9]{1,8}(?:동|읍|면|구)\b/g, '').trim();
  // 도로명 흔한 접미어 스크럽
  t = t.replace(/[\uAC00-\uD7A3]{2,10}(?:로|길)\s?\d*/g, '').trim();
  // 지번 패턴 (숫자-숫자) 스크럽
  t = t.replace(/\b\d{1,5}-\d{1,5}\b/g, '').trim();
  // 층·호 패턴 스크럽
  t = t.replace(/\b\d{1,3}\s*층\b/g, '').trim();
  t = t.replace(/\b\d{1,5}\s*호\b/g, '').trim();

  // 잔재 공백·구분자 정리
  t = t
    .replace(/\s+·\s+/g, ' · ')
    .replace(/·\s*·/g, '·')
    .replace(/\s{2,}/g, ' ')
    .trim();
  t = t.replace(/^[·\-\s,]+|[·\-\s,]+$/g, '').trim();

  return t;
}

/**
 * 제목이 주소 누출 의심인지 빠르게 판별 (백필 대상 선별용).
 * sanitizeAiTitle 이 실제로 뭔가를 지울 수 있는 조건과 동등.
 */
export function titleLeaksAddress(
  title: string | null | undefined,
  hints: SanitizerHints,
): boolean {
  if (!title) return false;
  const t = String(title);

  const tokens = [hints.gu, hints.dong, hints.address, hints.buildingInfo]
    .map(s => String(s || '').trim())
    .filter(s => s.length >= 2);

  for (const b of tokens) {
    if (t.includes(b)) return true;
  }
  if (/[\uAC00-\uD7A3A-Za-z0-9]{1,8}(?:동|읍|면|구)\b/.test(t)) return true;
  if (/[\uAC00-\uD7A3]{2,10}(?:로|길)\s?\d+/.test(t)) return true;
  if (/\b\d{1,5}-\d{1,5}\b/.test(t)) return true;
  if (/\b\d{1,3}\s*층\b/.test(t)) return true;
  if (/\b\d{1,5}\s*호\b/.test(t)) return true;
  return false;
}
