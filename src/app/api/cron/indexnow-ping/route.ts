// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/cron/indexnow-ping — PR-D
//
// 최근 24h 내 신규/업데이트된 매물 (자체 콘텐츠 있는 것만) 을 IndexNow 에 ping.
// 매시간 cron (Vercel) → Bing/Yandex/Naver 즉시 인덱싱 신호.
//
// 정책:
//   - 자체 콘텐츠 있는 매물만 (sitemap 과 일관 — checkHasOwnContent §L-seo1)
//   - status='공개' 만
//   - 최대 1,000 URL/cron run (한도 보호)
//   - INDEXNOW_KEY 미설정 시 fallback (사장님 부담 0)
//
// 헌법: §54 UI 변경 0 / §96 Phase 1 / §117 외부 API 비용 cap (IndexNow 무료)
// 빈도: 매시간 (vercel.json crons[28])
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { pingIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BASE = 'https://wishes.co.kr';
const LOOKBACK_HOURS = 24;
const MAX_URLS = 1000;

interface ListingRow {
  id: number;
  ai_description: string | null;
  description: string | null;
  seo_meta_description: string | null;
  updated_at: string | null;
}

function hasOwnContent(l: ListingRow): boolean {
  return !!(
    (l.ai_description && l.ai_description.trim().length > 30) ||
    (l.description && l.description.trim().length > 30) ||
    (l.seo_meta_description && l.seo_meta_description.trim().length > 30)
  );
}

export async function GET(request: NextRequest) {
  // G-86 (2026-05-04): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 fail-open)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const supabase = createServerClient();

  // 최근 24h 신규/업데이트 매물 (자체 콘텐츠 있는 것만)
  const { data, error } = await supabase
    .from('listings')
    .select('id, ai_description, description, seo_meta_description, updated_at')
    .eq('status', '공개')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(MAX_URLS * 2) // hasOwnContent 필터로 ~50% 제외 가정
    .returns<ListingRow[]>();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const eligible = (data || []).filter(hasOwnContent).slice(0, MAX_URLS);
  if (eligible.length === 0) {
    return NextResponse.json({
      success: true,
      submitted: 0,
      since,
      message: 'no_eligible_listings',
    });
  }

  const urls = eligible.map((l) => `${BASE}/listings/${l.id}`);
  const result = await pingIndexNow(urls);

  return NextResponse.json({
    success: result.ok,
    since,
    eligible: eligible.length,
    submitted: result.submitted ?? 0,
    status: result.status,
    reason: result.reason,
  });
}
