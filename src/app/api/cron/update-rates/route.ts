import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// Vercel Cron - runs daily at 9:00 AM KST (0:00 UTC)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 2026년 4월 최신 금리 데이터
const LATEST_MORTGAGE_RATES = [
  { label: '시중은행 주담대 (고정)', rate: 4.8 },
  { label: '보금자리론', rate: 4.5 },
  { label: '디딜돌대출', rate: 3.5 },
  { label: '신혼부부 디딜돌', rate: 2.7 },
];

const LATEST_JEONSE_RATES = [
  { label: '버팀목 전세대출', rate: 2.5 },
  { label: '카카오뱅크 전세', rate: 4.0 },
  { label: '시중은행 전세', rate: 4.2 },
  { label: '청년전용 버팀목', rate: 2.5 },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();
    
    const { error } = await supabase
      .from('loan_rates')
      .insert({
        mortgage_rates: LATEST_MORTGAGE_RATES,
        jeonse_rates: LATEST_JEONSE_RATES,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'DB update failed', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
      message: 'Rates updated successfully',
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
