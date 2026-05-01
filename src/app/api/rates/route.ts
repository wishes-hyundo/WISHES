import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// L-urgent1 (2026-04-22): /api/rates IP rate limit — 저비용 공개 GET 이지만
//   60/min 상한을 두어 Supabase free-tier PostgREST 요청 폭주 방어.
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `rates:ip:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('loan_rates')
      .select('mortgage_rates, jeonse_rates, updated_at, updated_by')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // L-sec44 (2026-04-22): Supabase 에러 메시지 prod 에서 숨김
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        isDev ? { error: 'No rate data found', details: error?.message } : { error: 'No rate data found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mortgage_rates: data.mortgage_rates,
      jeonse_rates: data.jeonse_rates,
      updated_at: data.updated_at,
      source: data.updated_by?.startsWith('ecos_cron') ? 'ECOS 자동수집' : '수동입력',
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}