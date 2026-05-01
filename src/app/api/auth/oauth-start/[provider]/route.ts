// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/auth/oauth-start/[provider]?target=/admin/
//
// 정적 HTML(admin-auth.html) 및 React 페이지에서 공용으로 사용하는 소셜
// 로그인 시작점. 두 provider 모두 우리 커스텀 백엔드를 거쳐 Supabase 세션을
// 생성하는 방식이라, Supabase 기본 Kakao/Naver provider(scope 하드코딩 문제)
// 를 우회한다.
//
//   - provider === 'kakao' / 'naver': 해당 OAuth authorize URL 로 302 redirect.
//     state(CSRF) 는 서버에서 HttpOnly 쿠키로, target redirect path 는
//     non-HttpOnly 쿠키로 심어 /auth/callback 이 fallback 으로 읽는다.
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

  const ip = getClientIp(request);
  const rl = checkRateLimit({
    key: `oauth-start:${provider}:ip:${ip}`,
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
  const isProd = process.env.NODE_ENV === 'production';
  const state = randomBytes(16).toString('hex');

  if (provider === 'kakao') {
    // 2026-04-23: Supabase 기본 Kakao provider 는 scope=account_email+profile_image+profile_nickname
    //   을 하드코딩해 KOE205 를 유발. Kakao authorize URL 로 직접 리다이렉트 +
    //   서버 (/api/auth/kakao) 에서 code 교환하도록 전환.
    const clientId = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Kakao OAuth 가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }
    const redirectUri = `${siteUrl}/auth/callback?provider=kakao`;
    const authorizeUrl =
      `https://kauth.kakao.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent('profile_nickname')}`;

    const res = NextResponse.redirect(authorizeUrl, { status: 302 });
    res.cookies.set({
      name: 'ws_kakao_state',
      value: state,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
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

  // provider === 'naver'
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: '네이버 OAuth 가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }
  const redirectUri = `${siteUrl}/auth/callback?provider=naver`;
  const naverUrl =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(naverUrl, { status: 302 });
  res.cookies.set({
    name: 'ws_naver_state',
    value: state,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
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
