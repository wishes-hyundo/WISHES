import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관.
import { oauthCodeSchema, oauthStateSchema } from '@/lib/schemas';

// L-sec66 (2026-04-22): OAuth code/state 입력 검증.
//   Naver authorization_code 는 일반적으로 30~200자, state 는 클라이언트에서
//   생성한 nonce 라 길이 상한을 두어 10MB 바디 DoS 방지.
// L-hub3: hub 의 oauthCodeSchema / oauthStateSchema 재사용.
const NaverOAuthSchema = z.object({
  code: oauthCodeSchema,
  state: oauthStateSchema.optional(),
});

// 네이버 OAuth 토큰 교환 및 사용자 생성/로그인
export async function POST(request: NextRequest) {
  try {
    // L-sec66 (2026-04-22): 공개 OAuth 콜백 스팸 방지
    //   15분 30회/IP cap. Naver token endpoint 할당량 및 Supabase admin ops 보호.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `auth:naver:ip:${_ip}`, limit: 30, windowMs: 15 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = NaverOAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }
    const { code, state } = parsed.data;

    const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      console.error('Naver OAuth credentials not configured');
      return NextResponse.json({ error: 'Naver OAuth not configured' }, { status: 500 });
    }

    // 1. 네이버에서 액세스 토큰 교환
    const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: NAVER_CLIENT_ID,
      client_secret: NAVER_CLIENT_SECRET,
      code: code,
      state: state || '',
    });

    const tokenResponse = await fetch(tokenUrl + '?' + tokenParams.toString(), {
      method: 'GET',
    });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Naver token error:', tokenData);
      return NextResponse.json({ error: 'Failed to get Naver access token' }, { status: 401 });
    }

    const accessToken = tokenData.access_token;

    // 2. 네이버 사용자 프로필 조회
    const profileResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });
    const profileData = await profileResponse.json();

    if (profileData.resultcode !== '00') {
      console.error('Naver profile error:', profileData);
      return NextResponse.json({ error: 'Failed to get Naver profile' }, { status: 401 });
    }

    const naverUser = profileData.response;
    const email = naverUser.email;
    const name = naverUser.name || naverUser.nickname || '';
    const avatarUrl = naverUser.profile_image || '';
    const naverId = naverUser.id;
    const phone = naverUser.mobile || '';

    if (!email) {
      return NextResponse.json({ error: 'Email is required from Naver' }, { status: 400 });
    }

    // 3. Supabase에서 사용자 찾기 또는 생성
    const supabase = createServerClient();

    // 이메일로 기존 사용자 찾기
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === email
    );

    let userId;

    if (existingUser) {
      userId = existingUser.id;
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingUser.user_metadata,
          full_name: name || existingUser.user_metadata?.full_name,
          avatar_url: avatarUrl || existingUser.user_metadata?.avatar_url,
          phone: phone || existingUser.user_metadata?.phone,
          provider: 'naver',
          naver_id: naverId,
        },
      });
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          avatar_url: avatarUrl,
          phone: phone,
          provider: 'naver',
          naver_id: naverId,
        },
      });

      if (createError || !newUser.user) {
        console.error('Create user error:', createError);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }

      userId = newUser.user.id;

      await supabase.from('profiles').upsert({
        id: userId,
        email: email,
        name: name,
        avatar_url: avatarUrl,
        provider: 'naver',
        profile_completed: false,
      }, { onConflict: 'id' });

      // 2026-04-23: 소셜 가입자도 admin_users 승인 플로우 합류.
      //   기존 register route 가 admin_users 를 만들었지만 Naver 경로가 이걸
      //   빠뜨려, 소셜 가입 사용자는 관리 승인 대기 목록에 보이지 않는 유령 계정이
      //   되었음. wishes@wishes.co.kr 은 즉시 approved, 나머지는 pending/viewer.
      try {
        const _isSuper = email.toLowerCase() === 'wishes@wishes.co.kr';
        // 2026-04-23 v2: 소셜 가입자는 user 권한 자동 승인 (reason 컬럼 없어 제외).
        await supabase.from('admin_users').insert({
          id: userId,
          email: email.toLowerCase(),
          name: name || null,
          phone: phone || null,
          company: null,
          role: _isSuper ? 'superadmin' : 'user',
          status: 'approved',
        });
      } catch (e) {
        // UNIQUE 충돌(이미 존재) 등은 무시 — 정상 경로.
        const msg = (e as { message?: string })?.message;
        console.warn('admin_users insert (naver) skipped:', msg || e);
      }
    }

    // 4. 매직링크 생성 - token_hash를 클라이언트에 반환하여 verifyOtp로 세션 생성
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
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

    // token_hash를 반환 - 클라이언트에서 verifyOtp로 세션 생성
    return NextResponse.json({
      success: true,
      token_hash: tokenHash,
      email: email,
      userId,
    });
  } catch (error) {
    console.error('Naver auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
