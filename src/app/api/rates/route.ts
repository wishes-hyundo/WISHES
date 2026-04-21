import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('loan_rates')
      .select('mortgage_rates, jeonse_rates, updated_at, updated_by')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'No rate data found', details: error?.message },
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