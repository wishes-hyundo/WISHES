/**
 * /api/cron/prewarm-public-listings
 *
 * Fix 18 (2026-05-10 사장님 명령): 고객용 /map 페이지 cache prewarm.
 *   매 2분 cron 으로 /api/listings/page 호출 → CDN cache populate.
 *   고객 첫 진입 5s → 1s 이내.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${CRON_SECRET}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Array<{ endpoint: string; status: number; size: number; time_ms: number }> = [];

  // 인기 endpoint prewarm
  const endpoints = [
    '/api/listings/page?limit=20&sort=latest',
    '/api/listings/page?limit=20&sort=price',
  ];

  for (const ep of endpoints) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(`${SITE_URL}${ep}`, { signal: ctrl.signal });
      clearTimeout(tid);
      const cl = parseInt(res.headers.get('content-length') || '0', 10);
      results.push({
        endpoint: ep,
        status: res.status,
        size: cl,
        time_ms: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        endpoint: ep,
        status: 0,
        size: 0,
        time_ms: Date.now() - t0,
      });
    }
  }

  return NextResponse.json({
    success: true,
    elapsed_ms: Date.now() - startedAt,
    results,
  });
}
