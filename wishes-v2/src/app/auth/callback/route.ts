import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const provider = searchParams.get('provider');

  // 네이버 OAuth 콜백 처리
  if (provider === 'naver') {
    const naverCode = searchParams.get('code');
    const state = searchParams.get('state');

    if (naverCode && state) {
      // 네이버 토큰 교환 → Supabase 커스텀 토큰 생성은
      // 서버사이드에서 처리 (추후 구현)
      return NextResponse.redirect(new URL('/?auth=naver_pending', request.url));
    }
  }

  // Supabase OAuth 콜백 (카카오, 구글)
  if (code) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 에러 시 홈으로 리다이렉트
  return NextResponse.redirect(new URL('/?auth=error', request.url));
}
