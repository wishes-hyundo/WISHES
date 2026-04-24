// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/mfa/login-verify
//
// L-mfa1 (2026-04-23): /challenge 로 받은 토큰과 TOTP 6자리 코드를 제출.
// 성공 시 서버가 sessionOk=true 를 반환하고, 프론트가 ws_session 쿠키를
// 발급받은 Bearer 기반 admin 세션을 '완전'하게 신뢰하도록 전환한다.
//
// body: { challenge: string, code: string }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { audit } from '@/lib/auditLog';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyChallenge } from '@/lib/mfaChallenge';
import { verifyTotp } from '@/lib/mfaTotp';
import { decryptMfaSecret, isMfaEncryptionReady } from '@/lib/mfaCrypto';

const bodySchema = z.object({
  challenge: z.string().min(16).max(1024),
  code: z.string().min(6).max(10).regex(/^[0-9\s]+$/),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await verifyAdminAuthWithContext(request);
    if (!ctx.ok || !ctx.uid) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    // per-uid rate limit
    const rl = checkRateLimit({
      key: `mfa:login-verify:uid:${ctx.uid}`,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    if (!isMfaEncryptionReady()) {
      return NextResponse.json({ success: false, error: 'MFA not configured' }, { status: 503 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    // 1) challenge HMAC 검증 + uid 일치 확인
    const ch = verifyChallenge(parsed.data.challenge);
    if (!ch.ok || ch.uid !== ctx.uid) {
      audit({
        action: 'mfa.login_verify.challenge_fail',
        actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
        target: { type: 'admin_user', id: ctx.uid },
        ip: getClientIp(request),
        meta: { reason: ch.reason || 'uid_mismatch' },
      });
      return NextResponse.json({ success: false, error: 'challenge_invalid' }, { status: 400 });
    }

    // 2) admin_users.mfa_secret 로드 + TOTP 검증
    const supabase = createServerClient();
    const { data: admin } = await supabase
      .from('admin_users')
      .select('mfa_enabled, mfa_secret')
      .eq('id', ctx.uid)
      .maybeSingle();

    if (!admin?.mfa_enabled || !admin.mfa_secret) {
      return NextResponse.json({ success: false, error: 'mfa_not_enabled' }, { status: 400 });
    }

    let secret: string;
    try {
      secret = decryptMfaSecret(admin.mfa_secret as string);
    } catch {
      return NextResponse.json({ success: false, error: 'secret_decrypt_failed' }, { status: 500 });
    }

    if (!verifyTotp(secret, parsed.data.code)) {
      audit({
        action: 'mfa.login_verify.totp_fail',
        actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
        target: { type: 'admin_user', id: ctx.uid },
        ip: getClientIp(request),
      });
      return NextResponse.json({ success: false, error: 'invalid_code' }, { status: 400 });
    }

    // 3) 성공 — mfa_last_used_at 갱신
    await supabase
      .from('admin_users')
      .update({ mfa_last_used_at: new Date().toISOString() })
      .eq('id', ctx.uid);

    audit({
      action: 'mfa.login_verify.ok',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      target: { type: 'admin_user', id: ctx.uid },
      ip: getClientIp(request),
    });

    return NextResponse.json({ success: true, mfa_passed: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : String((e as Error).message) },
      { status: 500 }
    );
  }
}
