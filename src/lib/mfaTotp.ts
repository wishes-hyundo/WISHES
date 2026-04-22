// ─────────────────────────────────────────────────────────────────────────
// L-mfa1 (2026-04-23): TOTP (RFC 6238) implementation — zero dependency.
//
// speakeasy/otplib 를 기본 의존성에 추가하지 않고도 RFC 6238 6-digit TOTP 를
// 직접 구현한다. Node 의 createHmac 만 사용. ±1 step(30초) drift 허용.
//
// - generateSecretBase32(): 20바이트 랜덤 → base32 encode (Google Auth 호환)
// - verifyTotp(secret, code, opts?): boolean
// - otpauthUrl(label, secret, issuer): 'otpauth://totp/...' (QR 용)
// - generateRecoveryCodes(n): ['xxxx-xxxx-xxxx', ...]
// - hashRecoveryCode(code): sha256 hex (정규화 후)
// ─────────────────────────────────────────────────────────────────────────

import { createHmac, randomBytes, createHash, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) throw new Error('invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20바이트 base32 secret 생성 (RFC 4226 권장 길이) */
export function generateSecretBase32(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP 코어 — counter 를 8바이트 big-endian 으로 HMAC-SHA1 */
function hotp(secret: Buffer, counter: bigint): string {
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(ctr).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * TOTP 검증 — ±window step 허용 (기본 1 → 총 ±30초).
 * 6자리 코드 정확 매칭. timing-safe 비교.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts?: { stepSec?: number; window?: number; nowMs?: number }
): boolean {
  const normalized = (code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  const stepSec = opts?.stepSec ?? 30;
  const window = opts?.window ?? 1;
  const nowMs = opts?.nowMs ?? Date.now();
  const secret = base32Decode(secretBase32);

  const counter = BigInt(Math.floor(nowMs / 1000 / stepSec));
  const candidate = Buffer.from(normalized, 'utf8');

  for (let w = -window; w <= window; w++) {
    const c = counter + BigInt(w);
    // L-build-fix3 (2026-04-23): 0n 리터럴은 tsconfig target ES2017 에서 금지
    //   (ES2020+ 필요). tsconfig 건드리는 대신 BigInt(0) 로 회피.
    if (c < BigInt(0)) continue;
    const expected = Buffer.from(hotp(secret, c), 'utf8');
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URL — Google Authenticator/Authy 호환 */
export function otpauthUrl(args: {
  label: string;        // e.g. 'admin@wishes.co.kr'
  secretBase32: string;
  issuer?: string;      // e.g. 'wishes'
  digits?: number;
  period?: number;
}): string {
  const issuer = args.issuer ?? 'wishes';
  const label = encodeURIComponent(`${issuer}:${args.label}`);
  const params = new URLSearchParams({
    secret: args.secretBase32,
    issuer,
    digits: String(args.digits ?? 6),
    period: String(args.period ?? 30),
    algorithm: 'SHA1',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 복구 코드 10개 — 'xxxx-xxxx-xxxx' (소문자 hex, 12글자 + 2 dash) */
export function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const b = randomBytes(6).toString('hex'); // 12 hex chars
    out.push(`${b.slice(0, 4)}-${b.slice(4, 8)}-${b.slice(8, 12)}`);
  }
  return out;
}

/** 정규화 (공백/대시 제거 + 소문자) 후 sha256 hex */
export function hashRecoveryCode(code: string): string {
  const normalized = (code || '').toLowerCase().replace(/[-\s]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
