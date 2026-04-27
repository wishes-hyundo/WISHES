/**
 * /api/cron/pipa-anonymize
 * 
 * Phase 1-5: pipa_anonymize_expired() SQL 함수 호출.
 * 사장님 명령: 거래 기록 영구 보존, PII 만 익명화 (3년 후).
 * Vercel Cron: 매일 04:00 KST.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('pipa_anonymize_expired');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, result: data, ts: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
