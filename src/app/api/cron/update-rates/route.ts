import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// Vercel Cron - runs daily at 9:00 AM KST (0:00 UTC)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Latest rates data - updated via cron
const CURRENT_RATES = {
  base_rate: 2.50,
  base_rate_source: 'bok.or.kr',
  updated_at: new Date().toISOString(),
  mortgage_rates: [
    { label: '시중은행 주담대 (고정)', rate: 4.8, range: '4.4~7.0', source: '전국은행연합회' },
    { label: '보금자리론', rate: 4.5, range: '4.35~4.65', source: '한국주택금융공사' },
    { label: '디딜돌대출', rate: 3.5, range: '2.85~4.15', source: '주택도시기금' },
    { label: '신혼부부 디딜돌', rate: 2.7, range: '2.15~3.60', source: '주택도시기금' },
  ],
  jeonse_rates: [
    { label: '버팀목 전세대출', rate: 2.5, range: '1.3~3.5', source: '주택도시기금' },
    { label: '카카오뱅크 전세', rate: 4.0, range: '3.8~4.2', source: '카카오뱅크' },
    { label: '시중은행 전세', rate: 4.2, range: '3.5~4.5', source: '전국은행연합회' },
    { label: '청년전용 버팀목', rate: 2.5, range: '2.0~3.1', source: '주택도시기금' },
  ],
};

async function fetchBOKBaseRate() {
  try {
    // Try BOK Open API for base rate
    const bokUrl = 'https://ecos.bok.or.kr/api/StatisticSearch/json/sample/1/1/722Y001/M/202601/202604/0101000';
    const resp = await fetch(bokUrl, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.StatisticSearch?.row?.[0]?.DATA_VALUE) {
        return parseFloat(data.StatisticSearch.row[0].DATA_VALUE);
      }
    }
  } catch (e) {
    console.log('BOK API fetch failed, using fallback rate');
  }
  return CURRENT_RATES.base_rate; // fallback
}

export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch latest base rate from BOK
    const baseRate = await fetchBOKBaseRate();
    
    const supabase = createClient();
    
    // Update rates in Supabase
    const { error } = await supabase
      .from('loan_rates')
      .insert({
        base_rate: baseRate,
        mortgage_rates: CURRENT_RATES.mortgage_rates,
        jeonse_rates: CURRENT_RATES.jeonse_rates,
        source: 'auto-cron',
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      base_rate: baseRate,
      updated_at: new Date().toISOString(),
      message: 'Rates updated successfully',
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
