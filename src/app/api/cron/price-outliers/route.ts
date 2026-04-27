import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServerClient();
  const [outliers, jeonse] = await Promise.all([
    supabase.rpc('auto_detect_price_outliers'),
    supabase.rpc('auto_detect_jeonse_risk'),
  ]);
  return NextResponse.json({
    success: true,
    price_outliers: outliers.data,
    jeonse_risk: jeonse.data,
  });
}
