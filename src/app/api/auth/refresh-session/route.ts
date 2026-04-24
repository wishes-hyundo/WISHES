// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/refresh-session
//
// refresh_token 을 받아서 Supabase 에서 새 access_token/refresh_token 세트를
// 발급받는다. 어드민 페이지가 1시간 JWT 만료 직전에 호출해 세션 유지.
// 응답의 refresh_token 은 rotation 되므로 클라이언트가 반드시 저장 갱신해야 함.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `refresh:${ip}`, limit: 120, windowMs: 15 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate limit' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }
    const body = await request.json().catch(() => ({}));
    const refreshToken: string = (body?.refresh_token || '').toString().trim();
    if (!refreshToken || refreshToken.length < 10 || refreshToken.length > 2048) {
      return NextResponse.json({ success: false, error: 'missing refresh_token' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ success: false, error: 'supabase not configured' }, { status: 500 });
    }
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      return NextResponse.json(
        { success: false, error: error?.message || 'refresh failed' },
        { status: 401 },
      );
    }
    return NextResponse.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
    });
  } catch (e) {
    console.error('[refresh-session] error:', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
