import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Vercel Cron - 매일 오전 9시(KST) 자동 실행
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

    // 서버 클라이언트 (service_role key) 사용 - RLS 우회
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('loan_rates')
      .insert({
        mortgage_rates: LATEST_MORTGAGE_RATES,
        jeonse_rates: LATEST_JEONSE_RATES,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      return NextResponse.json({ 
        error: 'DB update failed', 
        detail: error.message,
        code: error.code 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
      message: '금리 업데이트 완료',
      data: data,
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Internal error', 
      detail: error?.message 
    }, { status: 500 });
  }
}
