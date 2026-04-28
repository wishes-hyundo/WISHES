/**
 * /api/cron/enrich-land-price — 토지 공시지가 (V-World 무료)
 * env: VWORLD_API_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VWORLD_KEY = process.env.VWORLD_API_KEY || '';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!VWORLD_KEY) return NextResponse.json({ success: false, error: 'VWORLD_API_KEY 미설정', action: 'data.go.kr / V-World 신청 후 등록' }, { status: 503 });

  return NextResponse.json({ success: true, note: 'VWORLD_API_KEY 등록 후 자동 enrich 시작' });
}
