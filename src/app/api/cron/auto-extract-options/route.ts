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
  const [opt, rb] = await Promise.all([
    supabase.rpc('auto_extract_options_from_raw_fields'),
    supabase.rpc('auto_extract_rooms_bathrooms_from_raw'),
  ]);
  return NextResponse.json({
    success: true,
    options: opt.data,
    rooms_bath: rb.data,
    ts: new Date().toISOString(),
  });
}
