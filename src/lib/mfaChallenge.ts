// ─────────────────────────────────────────────────────────────────────────
// L-mfa1 (2026-04-23): MFA challenge token (short-lived HMAC).
//
// 1-factor(JWT 서명 + admin role) 통과 직후 발급되는 5분짜리 토큰.
// 사용자가 TOTP 를 입력해 /login-verify 로 제출할 때 "이 challenge 가
// 방금 해당 admin 에게 발급됐음" 을 서명으로 보장한다.
//
// 포맷: base64url(payload).base64url(hmac_sha256)
//   payload = JSON { uid, exp }
//   hmac key = MFA_CHALLENGE_SECRET env (또는 MFA_ENCRYPTION_KEY fallback)
// ─────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_MS = 5 * 60_000;

function resolveHmacKey(): Buffer {
  const k =
    process.env.MFA_CHALLENGE_SECRET ||
    process.env.MFA_ENCRYPTION_KEY ||
    '';
  if (!k || k.length < 16) {
    throw new Error('MFA_CHALLENGE_SECRET/MFA_ENCRYPTION_KEY is not set');
  }
  return Buffer.from(k, 'utf8');
}

export type ChallengePayload = { uid: string; exp: number };

export function signChallenge(uid: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload: ChallengePayload = { uid, exp: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', resolveHmacKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyChallenge(token: string): { ok: boolean; uid?: string; reason?: string } {
  try {
    const [body, sig] = (token || '').split('.');
    if (!body || !sig) return { ok: false, reason: 'format' };
    const expected = createHmac('sha256', resolveHmacKey()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'sig' };
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengePayload;
    if (!payload?.uid || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'payload' };
    }
    if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
    return { ok: true, uid: payload.uid };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}
