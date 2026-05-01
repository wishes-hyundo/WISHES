// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/mfa/enroll
//
// L-mfa1 (2026-04-23): 현재 로그인된 admin 에게 base32 TOTP secret 을 발급하고,
// otpauth URL 을 반환한다. 이 시점에서는 mfa_enabled=false — /verify 에서
// 사용자가 첫 6자리 코드를 제출해야만 활성화된다.
//
// 플로우:
//   1) verifyAdminAuthWithContext — JWT 검증 + uid 획득
//   2) generateSecretBase32() → 20바이트 랜덤
//   3) encryptMfaSecret(secret, MFA_ENCRYPTION_KEY)
//   4) UPDATE admin_users SET mfa_secret = <encrypted>, mfa_enabled = false
//   5) 응답: { secret: <base32>, otpauth: 'otpauth://...' }
//      ⚠ secret 평문은 응답 1회만 반환. 재등록 필요 시 재호출.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { audit } from '@/lib/auditLog';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { generateSecretBase32, otpauthUrl } from '@/lib/mfaTotp';
import { encryptMfaSecret, isMfaEncryptionReady } from '@/lib/mfaCrypto';

export async function POST(request: NextRequest) {
  try {
    // rate limit — enroll 남발 방지 (secret rotation 남용)
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `mfa:enroll:ip:${ip}`, limit: 5, windowMs: 10 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const ctx = await verifyAdminAuthWithContext(request);
    if (!ctx.ok || !ctx.uid) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    if (!isMfaEncryptionReady()) {
      return NextResponse.json(
        { success: false, error: 'MFA not configured (MFA_ENCRYPTION_KEY missing)' },
        { status: 503 }
      );
    }

    const secret = generateSecretBase32();
    const encrypted = encryptMfaSecret(secret);

    const supabase = createServerClient();
    const { error } = await supabase
      .from('admin_users')
      .update({
        mfa_secret: encrypted,
        mfa_enabled: false,         // /verify 성공 시 true 로
        mfa_enrolled_at: null,
      })
      .eq('id', ctx.uid);

    if (error) {
      return NextResponse.json(
        { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : error.message },
        { status: 500 }
      );
    }

    audit({
      action: 'mfa.enroll.start',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      target: { type: 'admin_user', id: ctx.uid },
      ip,
    });

    const url = otpauthUrl({
      label: ctx.email || ctx.uid,
      secretBase32: secret,
      issuer: 'wishes',
    });

    return NextResponse.json({ success: true, secret, otpauth: url });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : String((e as Error).message) },
      { status: 500 }
    );
  }
}
