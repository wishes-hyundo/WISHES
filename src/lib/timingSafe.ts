// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// timingSafe — 상수시간(string-equal) 비교 유틸
//
// ─── L-sec61 (2026-04-22) 타이밍 사이드채널 하드닝 ───
//   기존 `token === MASTER_PASSWORD` 같은 `===` 비교는 V8 내부적으로
//   길이 체크 + 첫 mismatch 에서 short-circuit 하므로 이론상 byte-by-byte
//   타이밍으로 시크릿을 추출할 수 있다. HTTPS 너머에선 네트워크 지터로
//   실용 공격이 어렵지만, secret 비교만큼은 상수시간 비교로 방어한다.
//
//   Node.js 내장 `crypto.timingSafeEqual` 은 Buffer 길이가 같아야만
//   동작하므로, 래퍼에서 먼저 길이를 비교 해서 (길이 자체는 secret의
//   엔트로피에 큰 영향이 없고, 이미 env 기준 최소 길이가 강제됨)
//   다를 경우 false 를 즉시 반환한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { timingSafeEqual as nodeTimingSafeEqual } from 'crypto';

/**
 * 두 문자열을 상수시간으로 비교한다.
 *
 * - 입력이 문자열이 아니거나 빈 문자열이면 false
 * - 길이가 다르면 false (길이는 secret 엔트로피에 비해 유의미하지 않음)
 * - 길이가 같으면 Node crypto.timingSafeEqual 로 바이트 비교
 */
export function timingSafeEqualStr(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;

  try {
    return nodeTimingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
