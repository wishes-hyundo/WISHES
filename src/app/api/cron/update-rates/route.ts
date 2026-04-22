import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ECOS_API_KEY = process.env.ECOS_API_KEY || 'sample';
const ECOS_BASE_URL = 'https://ecos.bok.or.kr/api/StatisticSearch';

const ECOS_CODES = {
  BASE_RATE: { table: '722Y001', item: '0101000' },
  MORTGAGE_RATE: { table: '121Y006', item: 'BECBLA0302' },
};

const POLICY_SPREADS = {
  BOGEUMJARI: 2.0,
  DIDIMDOL: 1.0,
  NEWLYWED_DIDIMDOL: 0.2,
  BEOTIMOK: 0.0,
  YOUTH_BEOTIMOK: 0.0,
};

const JEONSE_SPREADS = {
  BANK_JEONSE: -0.1,
  KAKAO_JEONSE: -0.3,
  FIXED_PREMIUM: 0.5,
};

async function fetchEcosRate(tableCode: string, itemCode: string): Promise<{ rate: number; period: string } | null> {
  try {
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = String(now.getMonth() + 1).padStart(2, '0');
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 6);
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');

    const url = `${ECOS_BASE_URL}/${ECOS_API_KEY}/json/kr/1/10/${tableCode}/M/${startYear}${startMonth}/${endYear}${endMonth}/${itemCode}`;
    console.log(`[ECOS] Fetching: ${tableCode}/${itemCode}`);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) { console.error(`[ECOS] HTTP error: ${response.status}`); return null; }
    const data = await response.json();
    if (data.RESULT?.CODE === 'INFO-200') { console.warn(`[ECOS] No data for ${tableCode}/${itemCode}`); return null; }
    
    const rows = data.StatisticSearch?.row;
    if (!rows || rows.length === 0) { console.warn(`[ECOS] Empty rows`); return null; }
    
    const latest = rows[rows.length - 1];
    const rate = parseFloat(latest.DATA_VALUE);
    const period = latest.TIME;
    console.log(`[ECOS] ${latest.ITEM_NAME1}: ${rate}% (${period})`);
    return { rate, period };
  } catch (error) {
    console.error(`[ECOS] Fetch error for ${tableCode}/${itemCode}:`, error);
    return null;
  }
}

function calculateAllRates(baseRate: number, mortgageRate: number) {
  const round = (n: number) => Math.round(n * 100) / 100;

  const mortgage_rates = [
    { label: '시중은행 주담대(고정)', rate: round(mortgageRate + JEONSE_SPREADS.FIXED_PREMIUM), description: 'ECOS 주담대 평균 + 고정금리 프리미엄' },
    { label: '보금자리론', rate: round(baseRate + POLICY_SPREADS.BOGEUMJARI), description: '한국주택금융공사 고정금리' },
    { label: '디딤돌대출', rate: round(baseRate + POLICY_SPREADS.DIDIMDOL), description: '주택도시기금 정책대출' },
    { label: '신혼부부 디딤돌', rate: round(baseRate + POLICY_SPREADS.NEWLYWED_DIDIMDOL), description: '주택도시기금 신혼부부 우대' },
  ];

  const jeonse_rates = [
    { label: '버팀목 전세대출', rate: round(baseRate + POLICY_SPREADS.BEOTIMOK), description: '주택도시기금 전세대출' },
    { label: '카카오뱅크 전세', rate: round(mortgageRate + JEONSE_SPREADS.KAKAO_JEONSE), description: '인터넷은행 전세대출' },
    { label: '시중은행 전세', rate: round(mortgageRate + JEONSE_SPREADS.BANK_JEONSE), description: '시중은행 평균 전세대출' },
    { label: '청년전용 버팀목', rate: round(baseRate + POLICY_SPREADS.YOUTH_BEOTIMOK), description: '주택도시기금 청년 우대' },
  ];

  return { mortgage_rates, jeonse_rates };
}

export async function GET(request: Request) {
  try {
    // L-sec32 (2026-04-22): CRON_SECRET 미설정 시 인증 우회되던 로직 수정.
    // L-sec90 (2026-04-22): NODE_ENV !== 'production' dev fallback 제거 → 모든 환경 CRON_SECRET 필수.
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !timingSafeEqualStr(token, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] === 금리 자동 업데이트 시작 ===');

    const [baseRateData, mortgageRateData] = await Promise.all([
      fetchEcosRate(ECOS_CODES.BASE_RATE.table, ECOS_CODES.BASE_RATE.item),
      fetchEcosRate(ECOS_CODES.MORTGAGE_RATE.table, ECOS_CODES.MORTGAGE_RATE.item),
    ]);

    if (!baseRateData || !mortgageRateData) {
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        {
          error: 'ECOS API 데이터 수집 실패',
          ...(isDev && {
            details: {
              baseRate: baseRateData ? 'OK' : 'FAILED',
              mortgageRate: mortgageRateData ? 'OK' : 'FAILED',
            },
          }),
        },
        { status: 500 }
      );
    }

    console.log(`[CRON] 기준금리: ${baseRateData.rate}% (${baseRateData.period})`);
    console.log(`[CRON] 주담대금리: ${mortgageRateData.rate}% (${mortgageRateData.period})`);

    const { mortgage_rates, jeonse_rates } = calculateAllRates(baseRateData.rate, mortgageRateData.rate);

    const supabase = createServerClient();
    const insertData = {
      mortgage_rates,
      jeonse_rates,
      updated_at: new Date().toISOString(),
      updated_by: `ecos_cron_${baseRateData.period}`,
    };

    const { data, error } = await supabase.from('loan_rates').insert(insertData).select();

    if (error) {
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: 'DB update failed', ...(isDev && { details: error.message }) },
        { status: 500 }
      );
    }

    console.log('[CRON] === 금리 자동 업데이트 완료 ===');

    return NextResponse.json({
      success: true,
      message: '금리 자동 업데이트 완료',
      data: {
        source: { base_rate: `${baseRateData.rate}% (${baseRateData.period})`, mortgage_rate: `${mortgageRateData.rate}% (${mortgageRateData.period})`, api: 'ECOS (한국은행 경제통계시스템)' },
        mortgage_rates,
        jeonse_rates,
        updated_at: insertData.updated_at,
      },
    });
  } catch (error) {
    console.error('[CRON] error:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'Internal server error', ...(isDev && { details: String(error) }) },
      { status: 500 }
    );
  }
}
