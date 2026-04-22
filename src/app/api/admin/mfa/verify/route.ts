// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/mfa/verify
//
// L-mfa1 (2026-04-23): enroll 후 최초 TOTP 6자리 코드를 제출해 MFA 를 활성화.
// 성공 시 mfa_enabled=true 로 전환하고 10개 recovery code 를 1회 반환.
//
// 플로우:
//   1) verifyAdminAuthWithContext (JWT 로그인 상태)
//   2) 사용자 rate limit: mfa:verify:${uid} 10/10min
//   3) admin_users.mfa_secret 조회 → decrypt
//   4) verifyTotp(secret, code, window=1)
//   5) 성공: mfa_enabled=true, mfa_enrolled_at=now, mfa_last_used_at=now
//      + 기존 admin_mfa_recovery_codes 삭제, 10개 신규 발급(해시만 저장)
//      + 평문 코드 10개는 응답 1회만 반환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { audit } from '@/lib/auditLog';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from '@/lib/mfaTotp';
import { decryptMfaSecret, isMfaEncryptionReady } from '@/lib/mfaCrypto';

const bodySchema = z.object({
  code: z.string().min(6).max(10).regex(/^[0-9\s]+$/),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await verifyAdminAuthWithContext(request);
    if (!ctx.ok || !ctx.uid) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    // per-user rate limit: 10 시도 / 10분
    const rlUser = checkRateLimit({
      key: `mfa:verify:uid:${ctx.uid}`,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!rlUser.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rlUser.retryAfterSec) } }
      );
    }

    if (!isMfaEncryptionReady()) {
      return NextResponse.json(
        { success: false, error: 'MFA not configured' },
        { status: 503 }
      );
    }

    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: admin, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, mfa_secret, mfa_enabled')
      .eq('id', ctx.uid)
      .maybeSingle();

    if (fetchErr || !admin?.mfa_secret) {
      return NextResponse.json(
        { success: false, error: 'not_enrolled' },
        { status: 400 }
      );
    }

    let secret: string;
    try {
      secret = decryptMfaSecret(admin.mfa_secret as string);
    } catch {
      return NextResponse.json(
        { success: false, error: 'secret_decrypt_failed' },
        { status: 500 }
      );
    }

    const ok = verifyTotp(secret, parsed.data.code);
    if (!ok) {
      audit({
        action: 'mfa.verify.fail',
        actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
        target: { type: 'admin_user', id: ctx.uid },
        ip: getClientIp(request),
      });
      return NextResponse.json({ success: false, error: 'invalid_code' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const recoveryCodes = generateRecoveryCodes(10);

    // atomic-ish: 기존 미소모 코드 삭제 + 신규 10개 삽입 + mfa_enabled=true
    await supabase
      .from('admin_mfa_recovery_codes')
      .delete()
      .eq('admin_user_id', ctx.uid);

    const inserts = recoveryCodes.map((c) => ({
      admin_user_id: ctx.uid,
      code_hash: hashRecoveryCode(c),
    }));
    const { error: insErr } = await supabase
      .from('admin_mfa_recovery_codes')
      .insert(inserts);

    if (insErr) {
      return NextResponse.json(
        { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : insErr.message },
        { status: 500 }
      );
    }

    const { error: updErr } = await supabase
      .from('admin_users')
      .update({
        mfa_enabled: true,
        mfa_enrolled_at: now,
        mfa_last_used_at: now,
      })
      .eq('id', ctx.uid);

    if (updErr) {
      return NextResponse.json(
        { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : updErr.message },
        { status: 500 }
      );
    }

    audit({
      action: 'mfa.verify.ok',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      target: { type: 'admin_user', id: ctx.uid },
      ip: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      mfa_enabled: true,
      recovery_codes: recoveryCodes,   // 평문 1회 반환
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : String((e as Error).message) },
      { status: 500 }
    );
  }
}
