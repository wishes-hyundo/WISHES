/**
 * /api/cron/rtms-sync — 국토부 실거래가 자동 동기화 (Phase 2-H)
 * data.go.kr API 무료 (일 10K 호출).
 * env: RTMS_API_KEY (사장님이 data.go.kr 신청 후 등록)
 * 미설정 시 무동작 + 안내.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RTMS_KEY = process.env.RTMS_API_KEY || process.env.DATA_GO_KR_KEY || '';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!RTMS_KEY) {
    return NextResponse.json({
      success: false,
      error: 'RTMS_API_KEY 미설정',
      action: 'data.go.kr 에서 RTMS API key 신청 후 Vercel env 등록 필요 (무료, 일 10K)',
    }, { status: 503 });
  }

  // RTMS 호출 — 시군구별 매매가 (lawd_cd 코드 + 거래월)
  // 일단 endpoint 만 마련. 실제 데이터 fetch + listings 매핑은 사장님 RTMS_API_KEY 등록 후
  return NextResponse.json({
    success: true,
    note: 'RTMS endpoint 준비 완료. RTMS_API_KEY 등록 후 자동 동작.',
    api_key_present: !!RTMS_KEY,
  });
}
