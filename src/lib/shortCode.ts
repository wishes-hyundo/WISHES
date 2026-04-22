// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shortCode — base62 단축 코드 생성·검증 유틸
// (v7 §5 단축 URL Phase 1 Backend)
//
// base62 알파벳: [0-9A-Za-z] 62자
//   6자리 → 62^6 ≈ 568억 — 충돌 확률 무시 가능
//   8자리 → 62^8 ≈ 218조 — 재시도용 폴백
//
// 안전성
//   crypto.randomInt / getRandomValues 로 균등 분포.
//   접두어 숫자 금지 옵션(없음) — wishes.me/0abc 허용.
//   블랙리스트(admin, api, login, signup) — 경로 충돌 방지.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const RESERVED = new Set([
  'admin', 'api', 'login', 'signup', 'auth', 'map', 'search',
  'listings', 'mypage', 'faq', 'about', 'contact', 'privacy',
  'terms', 'unsub', 'calculator', 'compare', 'robots', 'sitemap',
]);

/** 길이 len 의 base62 코드 생성 (crypto-safe) */
export function generateShortCode(len = 6): string {
  if (len < 4 || len > 12) {
    throw new Error(`[shortCode] length must be 4~12, got ${len}`);
  }

  // Node.js (server) / Edge (globalThis.crypto) 양쪽 호환
  const getRandomBytes = (n: number): Uint8Array => {
    const g = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (g && typeof g.getRandomValues === 'function') {
      return g.getRandomValues(new Uint8Array(n));
    }
    // Node 16+ fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require('crypto') as { randomBytes: (n: number) => Buffer };
    return new Uint8Array(randomBytes(n));
  };

  let out = '';
  // 편향 제거: 256 % 62 = 8 → 안전 상한 256-8=248
  while (out.length < len) {
    const buf = getRandomBytes(len * 2);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      const b = buf[i];
      if (b < 248) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** 유효한 단축코드 포맷인지 */
export function isValidShortCode(code: string): boolean {
  if (typeof code !== 'string') return false;
  if (code.length < 4 || code.length > 12) return false;
  if (!/^[0-9A-Za-z]+$/.test(code)) return false;
  if (RESERVED.has(code.toLowerCase())) return false;
  return true;
}

/** 공유될 host 기반 단축 URL 조립 (host 는 요청에서 추출) */
export function buildShortUrl(host: string, code: string): string {
  // wishes.me 전용 호스트가 있으면 우선, 없으면 현재 host 사용.
  // L-sec56 (2026-04-22): substring 매치 → 엄격한 hostname 검증.
  //   'evilwishes.co.kr.attacker.com' 같은 악성 호스트가 브랜드 단축 URL 로
  //   잘못 매핑되는 것을 방지.
  const primary = 'wishes.me';
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '').split(':')[0].toLowerCase();
  const isBrandHost =
    cleanHost === 'wishes.co.kr' ||
    cleanHost.endsWith('.wishes.co.kr') ||
    cleanHost === 'wishes.me' ||
    cleanHost.endsWith('.wishes.me') ||
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.vercel.app');
  const useHost = isBrandHost ? primary : cleanHost;
  return `${useHost}/${code}`;
}
