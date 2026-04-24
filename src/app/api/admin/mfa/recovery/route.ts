// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/mfa/recovery
//
// L-mfa1 (2026-04-23): 분실 대비 1회용 recovery code 로 MFA 를 통과.
// /challenge 로 받은 토큰과 recovery_code 를 제출 → 검증 성공 시 consume.
//
// body: { challenge: string, recovery_code: string }
//
// 주의:
//   - recovery code 는 1회용 (consumed_at 설정)
//   - 사용 후 프론트에서 즉시 /admin/mfa/setup 으로 재등록 유도
//   - 5회 실패 시 30분 rate limit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { audit } from '@/lib/auditLog';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyChallenge } from '@/lib/mfaChallenge';
import { hashRecoveryCode } from '@/lib/mfaTotp';

const bodySchema = z.object({
  challenge: z.string().min(16).max(1024),
  recovery_code: z.string().min(8).max(64),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await verifyAdminAuthWithContext(request);
    if (!ctx.ok || !ctx.uid) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const rl = checkRateLimit({
      key: `mfa:recovery:uid:${ctx.uid}`,
      limit: 5,
      windowMs: 30 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const ch = verifyChallenge(parsed.data.challenge);
    if (!ch.ok || ch.uid !== ctx.uid) {
      return NextResponse.json({ success: false, error: 'challenge_invalid' }, { status: 400 });
    }

    const hash = hashRecoveryCode(parsed.data.recovery_code);
    const supabase = createServerClient();

    const { data: row } = await supabase
      .from('admin_mfa_recovery_codes')
      .select('id')
      .eq('admin_user_id', ctx.uid)
      .eq('code_hash', hash)
      .is('consumed_at', null)
      .maybeSingle();

    if (!row?.id) {
      audit({
        action: 'mfa.recovery.fail',
        actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
        target: { type: 'admin_user', id: ctx.uid },
        ip: getClientIp(request),
      });
      return NextResponse.json({ success: false, error: 'invalid_recovery_code' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('admin_mfa_recovery_codes')
      .update({ consumed_at: now })
      .eq('id', row.id)
      .is('consumed_at', null);

    if (updErr) {
      return NextResponse.json(
        { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : updErr.message },
        { status: 500 }
      );
    }

    await supabase
      .from('admin_users')
      .update({ mfa_last_used_at: now })
      .eq('id', ctx.uid);

    audit({
      action: 'mfa.recovery.ok',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      target: { type: 'admin_user', id: ctx.uid },
      ip: getClientIp(request),
      meta: { code_id: row.id },
    });

    return NextResponse.json({
      success: true,
      mfa_passed: true,
      recovery_consumed: true,
      reenroll_required: true,   // 프론트가 /admin/mfa/setup 으로 유도
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : String((e as Error).message) },
      { status: 500 }
    );
  }
}
