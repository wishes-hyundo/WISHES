import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// 네이버 OAuth 토큰 교환 및 사용자 생성/로그인
export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

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

    let userId: string;

    if (existingUser) {
      // 기존 사용자가 있으면 메타데이터 업데이트
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
      // 새 사용자 생성
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

      // profiles 테이블에 기본 프로필 생성
      await supabase.from('profiles').upsert({
        id: userId,
        email: email,
        name: name,
        avatar_url: avatarUrl,
        provider: 'naver',
        profile_completed: false,
      }, { onConflict: 'id' });
    }

    // 4. 매직링크 생성 (OTP 방식으로 자동 로그인)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (linkError || !linkData) {
      console.error('Generate link error:', linkError);
      return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 });
    }

    // 응답에 리다이렉트 정보 포함
    const hashedToken = linkData.properties?.hashed_token;
    const verifyUrl = new URL('/auth/verify', request.nextUrl.origin);
    verifyUrl.searchParams.set('token_hash', hashedToken || '');
    verifyUrl.searchParams.set('type', 'magiclink');

    return NextResponse.json({
      success: true,
      redirect: verifyUrl.toString(),
      userId,
    });
  } catch (error) {
    console.error('Naver auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
