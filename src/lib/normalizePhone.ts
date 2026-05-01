// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizePhone — 한국 전화번호 표준 포맷팅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 입력: 사용자가 입력한 자유 형식 ("01012345678", "010 1234 5678", "02-3456-7890" 등)
// 출력: 표준 하이픈 포맷
//   모바일 010/011/016~019  → 010-XXXX-XXXX (3-4-4)
//   인터넷전화 070           → 070-XXXX-XXXX (3-4-4)
//   서울 02 (10자리)         → 02-XXXX-XXXX (2-4-4)
//   서울 02 (9자리 legacy)   → 02-XXX-XXXX  (2-3-4)
//   지방 광역 (11자리)       → 0XX-XXXX-XXXX (3-4-4) — 031, 032, 033, 041~044, 051~055, 061~064
//   지방 광역 (10자리 legacy)→ 0XX-XXX-XXXX  (3-3-4)
//   전국대표번호 8자리       → 15XX-XXXX / 16XX-XXXX / 18XX-XXXX
//   안심번호 12자리          → 050X-XXXX-XXXX (4-4-4)
//   매칭 실패                → 입력 trim + 공백 제거 그대로 반환 (사용자 입력 보존)
//
// L-sec170 후속 (2026-05-02, PR-S4-B P2-1):
//   기존 inline normalizePhone 은 010 11자리만 포맷팅했음. 02 10자리 / 지방 11자리 등
//   다양한 형식이 들어오면 raw cleaned 그대로 저장돼 사용자 검색·중복 체크에서 형식 차이로
//   miss 발생 가능. 표준 포맷팅으로 일관성 확보.
//
// 참고: 비식별/마스킹은 별도 (formatPhone vs normalizePhone) — 본 함수는 저장용 정규화만.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REGION_AREA_RE = /^0(3[1-3]|4[1-4]|5[1-5]|6[1-4])/;

export function normalizePhone(raw: string | null | undefined): string {
  const input = String(raw ?? '');
  const digits = input.replace(/\D/g, '');
  // 입력이 비어 있거나 숫자가 하나도 없으면 trim 만 해서 그대로 반환.
  if (!digits) return input.trim();

  const len = digits.length;
  const fallback = input.trim().replace(/\s+/g, '');

  // 8자리 전국대표번호 (15XX, 16XX, 18XX) — 4-4
  if (len === 8 && /^(15|16|18)\d{6}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  // 12자리 안심번호 050X — 4-4-4
  if (len === 12 && /^050\d/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  // 11자리: 모바일 010/011/016~019 또는 인터넷전화 070 — 3-4-4
  if (len === 11 && /^(01[016-9]|070)/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  // 11자리: 지방 광역 (031, 032, 033, 041~044, 051~055, 061~064) — 3-4-4
  if (len === 11 && REGION_AREA_RE.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  // 10자리: 서울 02 — 2-4-4
  if (len === 10 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // 10자리: 지방 광역 legacy (3-3-4)
  if (len === 10 && REGION_AREA_RE.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // 9자리: 서울 02 legacy — 2-3-4
  if (len === 9 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }

  // 매칭 실패 — 원본 (공백·기호 정리)만 반환. 정상적이지 않은 입력은 normalize 책임이 아님.
  return fallback;
}
