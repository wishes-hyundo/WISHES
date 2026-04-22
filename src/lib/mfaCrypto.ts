// ─────────────────────────────────────────────────────────────────────────
// L-mfa1 (2026-04-23): MFA secret AES-256-GCM encryption.
//
// admin_users.mfa_secret 은 base32 TOTP 시드(20바이트). 평문 저장 금지.
// Supabase service_role 키가 유출되더라도 secret 은 노출되지 않도록
// MFA_ENCRYPTION_KEY env(32바이트, hex 또는 base64)로 AES-256-GCM 암호화.
//
// 포맷 (base64url 단일 문자열):
//   base64url( iv(12) || ciphertext || authTag(16) )
//
// Key 요구:
//   - 32바이트 랜덤. hex(64글자) 또는 base64(44글자) 허용.
//   - 최소 32바이트 미만 시 throw — 약한 키로 암호화 금지.
// ─────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;        // GCM 권장 96-bit
const TAG_LEN = 16;
const KEY_LEN = 32;

function resolveKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('MFA_ENCRYPTION_KEY is not set or too short');
  }
  // hex(64) 우선 시도 → 실패 시 base64
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === KEY_LEN) return b64;
  // 마지막 fallback: utf8 첫 32바이트 — 권장하지 않음
  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length >= KEY_LEN) return utf8.subarray(0, KEY_LEN);
  throw new Error('MFA_ENCRYPTION_KEY must decode to 32 bytes (hex-64 or base64-44)');
}

/** base32 평문 secret → base64url(iv||ct||tag) */
export function encryptMfaSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64url');
}

/** base64url(iv||ct||tag) → 평문 base32 secret */
export function decryptMfaSecret(encoded: string): string {
  const key = resolveKey();
  const buf = Buffer.from(encoded, 'base64url');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('encrypted MFA secret too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** MFA_ENCRYPTION_KEY 설정 여부만 체크 (decrypt 시도 없이) */
export function isMfaEncryptionReady(): boolean {
  try {
    resolveKey();
    return true;
  } catch {
    return false;
  }
}
