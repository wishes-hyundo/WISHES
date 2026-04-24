// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/forgot-password
//   Supabase 의 resetPasswordForEmail 을 호출해 사용자에게 재설정 링크를 발송한다.
//
// 보안 메모:
//   - 응답은 이메일 존재 여부를 노출하지 않도록 항상 success:true 로 고정.
//     (Supabase 자체도 기본적으로 존재하지 않는 이메일에 대해 에러를 반환하지
//     않지만 방어적으로 한 번 더 마스킹.)
//   - 동일 IP 기준 15분 5회 제한 — 비밀번호 재설정 메일 스팸/메일봇 방지.
//   - redirectTo 는 반드시 NEXT_PUBLIC_SITE_URL 을 기반으로 서버에서 조립.
//     Supabase 대시보드의 "Redirect URLs" 허용 목록에도 동일 경로를 등록해야
//     이메일 링크 클릭 시 정상 착지한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';
import { emailSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ email: emailSchema });

function resolveSiteUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '');
  // fallback: request origin
  try {
    const origin = request.headers.get('origin');
    if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, '');
  } catch {
    /* noop */
  }
  return 'https://wishes.co.kr';
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({
      key: `forgot-password:${ip}`,
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      // 이메일 형식 오류도 사용자에게는 성공처럼 노출해 존재 여부 추정 차단.
      return NextResponse.json({ success: true });
    }
    const email = parsed.data.email.toLowerCase();

    const siteUrl = resolveSiteUrl(request);
    const redirectTo = `${siteUrl}/reset-password`;

    const supabase = createServerClient();
    // admin API 로 호출해야 service_role 권한으로 email 발송 가능.
    // supabase-js 에서는 auth.resetPasswordForEmail 이 anon key 로도 동작하므로
    // anon client 로 호출해도 되지만, 여기서는 서버 전용이므로 service role 그대로.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      // L-sec 마스킹: 에러 본문은 로그에만 남기고, 응답은 성공처럼 고정.
      console.warn('[forgot-password] resetPasswordForEmail error:', error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[forgot-password] exception:', err);
    // exception 이라도 success 로 응답 (이메일 존재 여부 누출 방지)
    return NextResponse.json({ success: true });
  }
}
