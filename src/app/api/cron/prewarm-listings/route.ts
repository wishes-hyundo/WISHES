/**
 * /api/cron/prewarm-listings
 *
 * Fix 16 (2026-05-10 사장님 명령): listings cache prewarm.
 *   매 5분 cron 으로 /api/admin/listings?fields=minimal 호출 →
 *   server unstable_cache (TTL 300s) 항상 fresh.
 *   사장님 cache 비워도 server cache 즉시 사용 → 첫 진입 57s -> 5s.
 *
 * 위험: 매우 낮음 (cron 추가만, 기존 코드 변경 X)
 * 비용: 매 5분 호출 = 일 288회. Supabase Pro 무제한.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
const INTERNAL_BEARER = process.env.WISHES_INTERNAL_BEARER || process.env.WISHES_ADMIN_MASTER_PASSWORD || '';

export async function GET(request: NextRequest) {
  // CRON_SECRET 강제 (G-87 패턴)
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${CRON_SECRET}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!INTERNAL_BEARER) {
    return NextResponse.json({ error: 'WISHES_INTERNAL_BEARER not configured' }, { status: 500 });
  }

  const startedAt = Date.now();

  try {
    // /api/admin/listings?fields=minimal 호출 (scope=all)
    // → server unstable_cache populate
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 50_000);
    const res = await fetch(`${SITE_URL}/api/admin/listings?fields=minimal`, {
      headers: {
        Authorization: `Bearer ${INTERNAL_BEARER}`,
      },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    const elapsed = Date.now() - startedAt;

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: `prewarm fetch failed: ${res.status}`,
        elapsed_ms: elapsed,
      }, { status: 500 });
    }

    // 응답 size 측정 (Content-Length 또는 본문 read)
    const contentLength = res.headers.get('content-length') || '0';
    const cacheStatus = res.headers.get('x-vercel-cache') || 'unknown';
    const etag = res.headers.get('etag') || '';

    return NextResponse.json({
      success: true,
      elapsed_ms: elapsed,
      content_length: parseInt(contentLength, 10),
      cache_status: cacheStatus,
      etag,
      message: `Prewarmed in ${elapsed}ms. Cache should be populated for next ${Math.floor(300 / 60)}min.`,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: (err as Error).message,
      elapsed_ms: Date.now() - startedAt,
    }, { status: 500 });
  }
}
