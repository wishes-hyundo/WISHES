// GET /api/unsub?t=TOKEN — 구독 해지 (T5-7)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    // L-sec36 (2026-04-22): 공개 엔드포인트. 토큰 길이 cap (DoS + DB 쿼리 폭주 방지).
    //   정상 unsub_token 은 uuid/hex 32~64자 수준.
    if (!token || token.length > 128) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('saved_searches')
      .update({ active: false })
      .eq('unsub_token', token)
      .select('id, email')
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '유효하지 않은 구독 토큰' }, { status: 404 });
    }
    return NextResponse.json({ success: true, email: data.email });
  } catch (e: any) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (e?.message || '서버 오류') : '서버 오류' },
      { status: 500 }
    );
  }
}
