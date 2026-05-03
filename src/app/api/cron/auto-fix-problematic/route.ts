/**
 * /api/cron/auto-fix-problematic
 * Phase 1-7: auto_listing_cleanup_full() 호출 (5종 자동 정리).
 *   1) 가격 누락 자동 비공개
 *   2) 중복 매물 자동 비공개 (가장 최근만 공개)
 *   3) 원룸 rooms > 1 → 1
 *   4) 투룸 rooms != 2 → 2
 *   5) area_m2 invalid → 비공개
 * 모두 영구 보존 (DB 에 그대로, status 만 변경). cron 매일.
 */

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
  const authHeader = (request.headers.get('authorization') || '');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('auto_listing_cleanup_full');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, result: data, ts: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
