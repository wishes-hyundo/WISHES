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
  // L-fix-cron-secret (2026-04-28): CRON_SECRET 미설정 시 fail-safe
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
