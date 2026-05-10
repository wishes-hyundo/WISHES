// Prewarm cron — /api/admin/listings unstable_cache 항상 warm 유지 (Fix 29)
//
// 매 4분 호출 → unstable_cache (revalidate=300s) 미리 갱신.
// 첫 진입 사용자 (사장님/직원/고객) function-level cache HIT → cold path 18s → ~1-2s.
// 그 다음 사용자가 CDN populate → 이후 < 100ms (CDN HIT, Fix 28 의 효과).
//
// I-CDN-1, I-CDN-2 보존: cron 의 fetch 자체는 INTERNAL_BEARER 사용.
// Authorization 있어 CDN populate X (의도). 단, route handler 의 unstable_cache
// 는 Data Cache 라 함수 instance 간 공유. 진짜 사용자가 hit 하면 그 응답이 CDN populate.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // 표준 cron auth — 다른 cron 들과 동일 패턴 (G-73)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://wishes.co.kr';

  // INTERNAL_BEARER 로 admin/listings 인증. unstable_cache (Data Cache) 갱신.
  const internal = process.env.WISHES_INTERNAL_BEARER || '';
  if (!internal) {
    return NextResponse.json({ error: 'WISHES_INTERNAL_BEARER not configured' }, { status: 500 });
  }

  const targets = [
    `${baseUrl}/api/admin/listings?fields=minimal&scope=all`,
  ];

  const results = await Promise.all(
    targets.map(async (url) => {
      const t1 = Date.now();
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${internal}`,
            'User-Agent': 'wishes-cron-prewarm/1.0',
          },
          // 매 호출 마다 fresh - cron 목적이 cache populate 이므로 의도적으로 cache: no-store
          cache: 'no-store',
        });
        const body = await res.text();
        return {
          url: url.replace(baseUrl, ''),
          status: res.status,
          size: body.length,
          xVercelCache: res.headers.get('x-vercel-cache'),
          cacheControl: res.headers.get('cache-control'),
          elapsedMs: Date.now() - t1,
          ok: res.ok,
        };
      } catch (e: any) {
        return {
          url: url.replace(baseUrl, ''),
          status: 0,
          error: String(e?.message || e),
          elapsedMs: Date.now() - t1,
          ok: false,
        };
      }
    })
  );

  return NextResponse.json(
    {
      success: results.every((r) => r.ok),
      totalElapsedMs: Date.now() - t0,
      results,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
