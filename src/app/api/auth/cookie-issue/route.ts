// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/cookie-issue
//   HttpOnly + Secure + SameSite=Strict 쿠키로 JWT 를 보관한다.
//   L-sec133 (2026-04-23, C-2 phase 1):
//     sessionStorage 에 평문 JWT/admin_password 를 두던 현 아키텍처를
//     XSS 가 읽을 수 없도록 HttpOnly 쿠키로 옮기는 다단계 마이그레이션의
//     1단계. 이 엔드포인트는 "기존 플로우를 건드리지 않는 추가(additive)
//     쓰기 경로" 이다 — 호출하지 않는 클라이언트에게는 아무 영향 없음.
//
//   phase 2 (후속): 관리자 대시보드가 로그인 직후 이 엔드포인트를 호출하도록
//     전환하고, 이후의 admin API fetch 는 Authorization 헤더 대신
//     credentials: 'include' 를 사용.
//
//   phase 3 (후속): sessionStorage 에서 ws_token / admin_password 삭제.
//     legacy 경로 전부 제거.
//
//   CSRF 메모: SameSite=Strict 자체로 top-level 크로스 사이트 POST 는 쿠키를
//     동반하지 않으나, same-origin XSS 가 여전히 쿠키를 사용한 fetch 를 띄울
//     수 있다. phase 2 에서 origin/referer 검증 + double-submit token 을 추가.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 쿠키 수명 — JWT access token 수명과 정렬. Supabase 기본 1h.
const COOKIE_MAX_AGE_SEC = 60 * 60;
const COOKIE_NAME = 'ws_session';

export async function POST(request: NextRequest) {
  try {
    // 로그인 직후 1회성 엔드포인트라 관대하게 잡되, brute-force 에는 제한.
    const ip = getClientIp(request);
    const rl = checkRateLimit({
      key: `cookie-issue:${ip}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const accessToken: string = (body?.access_token || '').toString().trim();

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'access_token 이 필요합니다.' },
        { status: 400 },
      );
    }

    // JWT 형식 최소 검증 — 실제 서명 검증은 supabase.auth.getUser() 가 수행.
    if (!accessToken.startsWith('eyJ') || accessToken.split('.').length !== 3) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 토큰입니다.' },
        { status: 400 },
      );
    }

    // Supabase 서명 검증 — 임의의 JWT 로 쿠키가 발급되는 것 차단.
    const supabase = createServerClient();
    const { data, error } = await Promise.race([
      supabase.auth.getUser(accessToken),
      new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000),
      ),
    ]) as { data: { user: any }; error: any };

    if (error || !data?.user) {
      return NextResponse.json(
        { success: false, error: '토큰 서명 검증 실패' },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ success: true });

    // HttpOnly / Secure / SameSite=Strict. JS 에서 document.cookie 로 읽을 수 없음.
    //   Secure 플래그는 production 에서만 강제 — localhost dev 에서는 HTTPS 가 없음.
    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: COOKIE_NAME,
      value: accessToken,
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });

    return response;
  } catch (err: any) {
    console.error('[cookie-issue] error', err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: '쿠키 발급 실패', ...(isDev && { detail: err?.message }) },
      { status: 500 },
    );
  }
}

// DELETE /api/auth/cookie-issue — 로그아웃용. 쿠키를 즉시 만료.
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
