import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServerClient();
  const [opt, rb] = await Promise.all([
    supabase.rpc('auto_extract_options_from_raw_fields'),
    supabase.rpc('auto_extract_rooms_bathrooms_from_raw'),
  ]);
  // L-fix-audit (2026-04-28): cron 실행 추적 (사장님 dashboard 노출). 실패 무시.
  try {
    await supabase.from('admin_audit_log').insert({
      action: 'auto_extract_options_run',
      target_type: 'system',
      meta: { options: opt.data, rooms_bath: rb.data, ts: new Date().toISOString() },
    });
  } catch (_) { /* audit fail silent */ }
  return NextResponse.json({
    success: true,
    options: opt.data,
    rooms_bath: rb.data,
    ts: new Date().toISOString(),
  });
}
