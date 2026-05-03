/**
 * /api/cron/sota-recommend — 월 1회 SOTA 자동 추천 (사장님 명령)
 * 부트스트랩 §8-4 의 8개 키워드 + Claude / Gemini 분석 → sota_reports 테이블 + 마크다운 보고서
 * 
 * 무료: Anthropic Prompt cache 90% 절감 + Gemini Flash 일 100K
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SOTA_TOPICS = [
  '2026 real estate proptech innovations',
  '2026 한국 부동산 신기술 SaaS',
  'Next.js 17 release notes',
  'Claude API new features 2026',
  'shadcn/ui new components 2026',
  'TanStack new releases 2026',
  '한국 공공 데이터 신규 부동산 API',
  'Korean LLM real estate benchmark 2026',
];

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
  const month = new Date().toISOString().slice(0, 7); // '2026-04'

  // 이미 작성된 월이면 skip
  const { data: existing } = await supabase
    .from('sota_reports')
    .select('id')
    .eq('month', month)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, message: 'already exists', month });
  }

  // SOTA 토픽들을 sota_reports 에 placeholder 저장
  // 실제 WebSearch + AI 분석은 별도 admin 페이지에서 사장님이 보거나 자가검수 시스템에서
  await supabase.from('sota_reports').insert({
    month,
    topics: SOTA_TOPICS.map(t => ({ query: t, scheduled: true })),
    raw_search: 'cron-scheduled',
    generated_by: 'cron',
  });

  return NextResponse.json({
    success: true,
    month,
    topics: SOTA_TOPICS.length,
    note: 'SOTA 검색 예약. 자가검수 시스템에서 후속 처리.',
  });
}
