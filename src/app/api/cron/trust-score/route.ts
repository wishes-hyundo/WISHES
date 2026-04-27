import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('auto_calculate_trust_score');
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, result: data });
}
