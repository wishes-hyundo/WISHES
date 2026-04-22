// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/mfa/challenge
//
// L-mfa1 (2026-04-23): 1-factor(password/JWT) 통과 직후 호출.
// admin_users.mfa_enabled=true 이면 5분짜리 HMAC challenge 토큰 발급.
// 클라이언트는 /admin/mfa 페이지에서 code 입력 → /login-verify 호출.
//
// mfa_enabled=false 일 때:
//   - (grace 기간 내) → mfa_required=false 로 응답해 로그인 허용
//   - (grace 기간 경과) → 응답에 mfa_required=true + challenge 없음,
//     프론트에서 /admin/mfa/setup 으로 강제 리다이렉트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { signChallenge } from '@/lib/mfaChallenge';

// 14일 grace — 이 기간 안에는 mfa 미등록도 통과시킨다 (setup 유도 배너)
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60_000;
const MFA_HARD_CUTOFF = process.env.MFA_HARD_CUTOFF_ISO
  ? new Date(process.env.MFA_HARD_CUTOFF_ISO).getTime()
  : Date.now() + GRACE_PERIOD_MS;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `mfa:challenge:${ip}`, limit: 30, windowMs: 10 * 60_000 });
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

    // env 기반(master/crawler_bridge) 는 2FA 대상이 아님 (mTLS/IP 화이트리스트로 분리)
    if (ctx.role === 'master' || ctx.role === 'crawler_bridge') {
      return NextResponse.json({ success: true, mfa_required: false, role: ctx.role });
    }

    const supabase = createServerClient();
    const { data: admin } = await supabase
      .from('admin_users')
      .select('mfa_enabled')
      .eq('id', ctx.uid)
      .maybeSingle();

    const enabled = Boolean(admin?.mfa_enabled);

    if (!enabled) {
      const hardBlocked = Date.now() > MFA_HARD_CUTOFF;
      return NextResponse.json({
        success: true,
        mfa_required: hardBlocked,      // true → 프론트가 setup 강제
        mfa_enabled: false,
        grace_remaining_sec: Math.max(0, Math.floor((MFA_HARD_CUTOFF - Date.now()) / 1000)),
      });
    }

    // mfa_enabled — 5분짜리 challenge 발급
    const challenge = signChallenge(ctx.uid);
    return NextResponse.json({
      success: true,
      mfa_required: true,
      mfa_enabled: true,
      challenge,
      expires_in_sec: 300,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === 'production' ? 'internal' : String((e as Error).message) },
      { status: 500 }
    );
  }
}
