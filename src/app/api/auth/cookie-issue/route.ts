// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/cookie-issue
//   HttpOnly + Secure + SameSite=Strict 쿠키로 JWT 를 보관한다.
//
// L-sec133 (2026-04-23, C-2 phase 1):
//   sessionStorage 에 평문 JWT/admin_password 를 두던 현 아키텍처를
//   XSS 가 읽을 수 없도록 HttpOnly 쿠키로 옮기는 다단계 마이그레이션의
//   1단계. "기존 플로우를 건드리지 않는 추가(additive) 쓰기 경로".
//
// L-sec142 (2026-04-23, C-2 phase 2):
//   - 요청의 Origin/Referer same-origin 검증 추가 (CSRF 1차 방어).
//   - ws_csrf 쿠키(double-submit 토큰) 동시 발급 + response body 에도 포함.
//     클라이언트는 sessionStorage 에 저장해 phase 3 에서 X-CSRF-Token
//     헤더로 같이 보낸다.
//   - phase 3: admin mutation route 전부 verifyCsrfDoubleSubmit 게이트 추가 후
//     sessionStorage ws_token / admin_password 제거.
//
// CSRF 메모:
//   SameSite=Strict 자체로 top-level 크로스 사이트 POST 는 쿠키를 동반하지
//   않으나, same-origin XSS 가 여전히 쿠키를 사용한 fetch 를 띄울 수 있다.
//   이번 phase 에서 origin 검증 + CSRF double-submit 토큰 기반 준비까지 마침.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { generateCsrfToken, verifySameOrigin, CSRF_COOKIE_NAME } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 쿠키 수명 — JWT access token 수명과 정렬. Supabase 기본 1h.
const COOKIE_MAX_AGE_SEC = 60 * 60;
const COOKIE_NAME = 'ws_session';

export async function POST(request: NextRequest) {
  try {
    // L-sec142 (C-2 phase 2): CSRF 1차 방어. same-origin 아니면 즉시 거부.
    const origin = verifySameOrigin(request);
    if (!origin.ok) {
      return NextResponse.json(
        { success: false, error: 'origin 검증 실패' },
        { status: 403 },
      );
    }

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

    // L-sec142: double-submit CSRF 토큰. ws_csrf 쿠키 + body 둘 다에 동일 값.
    const csrfToken = generateCsrfToken();

    const response = NextResponse.json({ success: true, csrfToken });

    const isProd = process.env.NODE_ENV === 'production';

    // HttpOnly 세션 쿠키 (JS 가 읽을 수 없음)
    response.cookies.set({
      name: COOKIE_NAME,
      value: accessToken,
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });

    // CSRF 쿠키 (JS 가 읽을 수 있어야 함 — X-CSRF-Token 헤더로 echo 하기 위해).
    //   탈취되어도 double-submit 특성상 "쿠키+헤더" 가 모두 일치해야 통과하므로
    //   same-origin XSS 가 아닌 이상 가치 없음. 일반 쿠키 탈취/스나핑엔 무력.
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: csrfToken,
      httpOnly: false,
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

// DELETE /api/auth/cookie-issue — 로그아웃용. ws_session + ws_csrf 모두 만료.
export async function DELETE(request: NextRequest) {
  // L-sec142: 로그아웃도 same-origin 만 허용 (CSRF 로 임의 로그아웃 차단).
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(
      { success: false, error: 'origin 검증 실패' },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ success: true });
  const isProd = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: '',
    httpOnly: false,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
