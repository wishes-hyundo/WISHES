// GET /api/admin/subscribers — 알림 구독자 리스트 (T5-7)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace('Bearer ', '');
  if (auth !== 'wishes2026') {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('active') !== '0';

    let query = supabase
      .from('saved_searches')
      .select('id, name, email, phone, deal, type, gu, dong, max_price, max_deposit, max_monthly, min_area_m2, source, last_notified_at, total_sent, active, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (onlyActive) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;

    // 요약 통계
    const total = data?.length || 0;
    const active = (data || []).filter((r: any) => r.active).length;
    const neverNotified = (data || []).filter((r: any) => !r.last_notified_at && r.active).length;

    return NextResponse.json({
      success: true,
      stats: { total, active, neverNotified },
      subscribers: data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
