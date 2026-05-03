/**
 * /api/cron/price-outliers — 깡통전세 위험만 (사장님 명령 2026-04-28)
 * 사장님: "가격 이상치는 시세 있어서 자동 판단 어려움" — 가격 이상치 자동 제거
 * 단 깡통전세 (전세가율 80%+) 는 그대로 유지 (객관 룰)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const { data, error } = await supabase.rpc('auto_detect_jeonse_risk');
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, jeonse_risk: data });
}
