// GET /api/unsub?t=TOKEN — 구독 해지 (T5-7)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) return NextResponse.json({ success: false, error: '토큰이 없습니다' }, { status: 400 });

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
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
