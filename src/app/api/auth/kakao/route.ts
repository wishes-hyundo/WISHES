// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/kakao
//
// 커스텀 Kakao OAuth 백엔드. Supabase 내장 Kakao provider 가
// authorize 요청 시 scope=account_email 을 강제로 끼워넣어 KOE205
// ("잘못된 요청") 을 유발하는 문제를 우회하기 위한 전용 라우트.
// 네이버 route(/api/auth/naver)와 완전히 동일한 패턴:
//   1) authorization_code → Kakao token endpoint 교환
//   2) Kakao /v2/user/me 로 프로필 조회
//   3) Supabase admin API 로 사용자 생성/업데이트
//   4) admin_users 에 pending 행 생성 (소셜 가입자 승인 flow)
//   5) generateLink('magiclink') 의 token_hash 를 클라이언트에 반환
//      → /auth/callback 이 verifyOtp 로 세션 생성
//
// 환경변수:
//   NEXT_PUBLIC_KAKAO_REST_API_KEY  (REST API 키, public, 빌드 시 인라인)
//   KAKAO_CLIENT_SECRET             (Client Secret, 서버 전용)
// 선택:
//   NEXT_PUBLIC_SITE_URL (기본 https://wishes.co.kr)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { oauthCodeSchema, oauthStateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KakaoOAuthSchema = z.object({
  code: oauthCodeSchema,
  state: oauthStateSchema.optional(),
  redirect_uri: z.string().url().max(512).optional(),
});

const SUPERADMIN_EMAILS = new Set(['wishes@wishes.co.kr']);

function resolveRedirectUri(request: NextRequest, override?: string): string {
  if (override && /^https?:\/\//.test(override)) return override;
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && /^https?:\/\//.test(envUrl)) return `${envUrl.replace(/\/$/, '')}/auth/callback?provider=kakao`;
  try {
    const origin = request.headers.get('origin') || request.headers.get('referer');
    if (origin) {
      const u = new URL(origin);
      return `${u.protocol}//${u.host}/auth/callback?provider=kakao`;
    }
  } catch { /* noop */ }
  return 'https://wishes.co.kr/auth/callback?provider=kakao';
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `auth:kakao:ip:${ip}`, limit: 30, windowMs: 15 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = KakaoOAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }
    const { code, redirect_uri: clientRedirect } = parsed.data;

    const clientId = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error('Kakao OAuth credentials not configured');
      return NextResponse.json({ error: 'Kakao OAuth not configured' }, { status: 500 });
    }

    const redirectUri = resolveRedirectUri(request, clientRedirect);

    // 1) authorization_code → access_token 교환
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error('Kakao token exchange failed:', tokenData);
      return NextResponse.json({ error: 'Failed to get Kakao access token' }, { status: 401 });
    }
    const accessToken: string = tokenData.access_token;

    // 2) 카카오 사용자 프로필 조회
    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profileData = await profileRes.json().catch(() => ({}));
    if (!profileRes.ok || !profileData.id) {
      console.error('Kakao profile error:', profileData);
      return NextResponse.json({ error: 'Failed to get Kakao profile' }, { status: 401 });
    }

    const kakaoId: string = String(profileData.id);
    const kakaoAccount = profileData.kakao_account || {};
    const profile = kakaoAccount.profile || {};
    const nickname: string = profile.nickname || '';
    const profileImageUrl: string = profile.profile_image_url || '';
    // email 은 비즈 앱 전환 후 account_email 동의를 받아야 채워짐. 현재는 대개 undefined.
    const kakaoEmail: string | undefined = kakaoAccount.email;

    // 3) Supabase 에서 사용자 찾기/생성.
    //   이메일이 없으면 안정적인 가짜 이메일을 만들어 auth.users.email 에 심는다.
    //   Supabase auth 는 email 유니크 제약을 걸고 있어 id 만으로는 lookup 이 불편하므로
    //   `kakao_<id>@users.wishes.co.kr` 형태로 고정.
    const syntheticEmail = `kakao_${kakaoId}@users.wishes.co.kr`;
    const email = (kakaoEmail && /^[^@]+@[^@]+\.[^@]+$/.test(kakaoEmail))
      ? kakaoEmail.toLowerCase()
      : syntheticEmail;

    const supabase = createServerClient();

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === email || u.user_metadata?.kakao_id === kakaoId,
    );

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingUser.user_metadata,
          full_name: nickname || existingUser.user_metadata?.full_name,
          avatar_url: profileImageUrl || existingUser.user_metadata?.avatar_url,
          provider: 'kakao',
          kakao_id: kakaoId,
        },
      });
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: nickname,
          avatar_url: profileImageUrl,
          provider: 'kakao',
          kakao_id: kakaoId,
        },
      });
      if (createError || !newUser?.user) {
        console.error('Create user error:', createError);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }
      userId = newUser.user.id;

      // P2-3 (2026-05-03): 사장님 명령 — 고객(OAuth)은 profiles, 직원(자체)은 admin_users 분리.
      //   기존: kakao/naver 도 admin_users 에 insert (혼재). 정합성 깨짐 + 사장님 검증 흐름 혼란.
      //   변경: OAuth 가입자는 profiles 만. admin_users insert 코드 제거.
      //   provider 컬럼 → source 컬럼 통일 (P2-3 마이그레이션).
      await supabase.from('profiles').upsert({
        id: userId,
        email,
        name: nickname,
        avatar_url: profileImageUrl,
        source: 'kakao',
        profile_completed: false,
      }, { onConflict: 'id' });
    }

    // 4) 매직링크 생성 → token_hash 만 클라이언트에 반환 (verifyOtp 로 세션 복원)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkError || !linkData) {
      console.error('Generate link error:', linkError);
      return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 });
    }
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) {
      console.error('No hashed_token in generateLink response');
      return NextResponse.json({ error: 'Failed to generate login token' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      token_hash: tokenHash,
      email,
      userId,
    });
  } catch (error) {
    console.error('Kakao auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
