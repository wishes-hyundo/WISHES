// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/auth/oauth-start/[provider]?target=/admin/
//
// 목적: 정적 HTML(admin-auth.html) 에서 소셜 로그인/가입을 시작할 때 사용.
//   해당 페이지는 Supabase/Naver client ID 를 인라인하기 어렵고, 보안상
//   state 는 서버에서 HttpOnly 쿠키로 관리하는 편이 깔끔하다.
//
// 동작:
//   - provider === 'kakao'  : Supabase 의 Kakao OAuth 시작 URL 로 302 redirect
//       (Kakao 는 Supabase Auth Providers 에 등록돼 있어야 함)
//   - provider === 'naver'  : Naver OAuth authorize URL 로 302 redirect
//       + ws_naver_state (HttpOnly) 쿠키로 CSRF state 주입.
//       /auth/callback 은 기존대로 sessionStorage 를 보지만, 정적 페이지 흐름을
//       위해 state 를 쿠키에도 동시 세팅하고 콜백이 sessionStorage 부재 시
//       쿠키로 fallback 하도록 한다. (이번 PR 에서는 sessionStorage 재생성까지만
//       처리 — 실제 state 대조는 콜백이 하도록 유지한다.)
//
// redirect 경로:
//   콜백 완료 후 /auth/callback 은 sessionStorage['wishes-auth-redirect']
//   값을 읽어 이동한다. admin-auth.html 이 리다이렉트 전에 해당 값을 세팅하거나
//   쿠리 파라미터 target 으로 받은 값을 response 에 심어 브라우저가 sessionStorage
//   를 채우도록 한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PROVIDERS = new Set(['kakao', 'naver']);

function safeTarget(raw: string | null): string {
  const v = String(raw || '').trim();
  if (!v) return '/admin/';
  if (!v.startsWith('/')) return '/admin/';
  if (v.startsWith('//')) return '/admin/';
  if (v.includes('\\')) return '/admin/';
  if (v.length > 512) return '/admin/';
  return v;
}

function resolveSiteUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '');
  try {
    const origin = request.headers.get('origin') || request.headers.get('referer');
    if (origin) {
      const u = new URL(origin);
      return `${u.protocol}//${u.host}`;
    }
  } catch { /* noop */ }
  return 'https://wishes.co.kr';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }

  // 스팸/봇 방지 — 1분 20회/IP 상한.
  const ip = getClientIp(request);
  const rl = checkRateLimit({
    key: `oauth-start:${provider}:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const target = safeTarget(searchParams.get('target'));
  const siteUrl = resolveSiteUrl(request);

  // admin-auth.html 에서 target 을 sessionStorage 로 직접 세팅하기 어렵기 때문에,
  // /auth/callback 이 쿠키로 fallback 할 수 있도록 ws_oauth_target 쿠키에 심는다.
  // 10분 수명.
  const isProd = process.env.NODE_ENV === 'production';

  if (provider === 'kakao') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'Supabase URL 이 설정되지 않았습니다.' },
        { status: 500 },
      );
    }
    // Supabase Auth 의 Kakao OAuth entry. Supabase 대시보드에서 Kakao provider 가
    // 활성화되어 있고 Redirect URL 로 `${siteUrl}/auth/callback` 이 등록되어 있어야 함.
    const redirectTo = `${siteUrl}/auth/callback`;
    const authorizeUrl =
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/authorize` +
      `?provider=kakao` +
      `&redirect_to=${encodeURIComponent(redirectTo)}`;

    const res = NextResponse.redirect(authorizeUrl, { status: 302 });
    // httpOnly:false — /auth/callback 이 document.cookie 로 읽어 sessionStorage
    // 가 유실된 경우에도 admin 리다이렉트 타겟을 복구할 수 있게 한다.
    // 값 자체는 same-origin path 화이트리스트로만 구성되므로 열려도 기밀이 아님.
    res.cookies.set({
      name: 'ws_oauth_target',
      value: target,
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return res;
  }

  // provider === 'naver'
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: '네이버 OAuth 가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }
  const state = randomBytes(16).toString('hex');
  const redirectUri = `${siteUrl}/auth/callback?provider=naver`;
  const naverUrl =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(naverUrl, { status: 302 });
  // 콜백에서 sessionStorage 에 쓰인 state 와 이 쿠키를 둘 다 참조할 수 있게 한다.
  res.cookies.set({
    name: 'ws_naver_state',
    value: state,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax', // Naver 가 리다이렉트로 돌려보낼 때 쿠키 동반되도록 lax.
    path: '/',
    maxAge: 600,
  });
  res.cookies.set({
    name: 'ws_oauth_target',
    value: target,
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
