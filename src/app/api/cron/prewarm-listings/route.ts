// Prewarm cron — /api/admin/listings cache 항상 warm 유지
// Vercel cron 이 30분마다 호출 → unstable_cache (5분 TTL revalidate=300) 갱신 + CDN cache populate
// 첫 진입 사장님 / 직원 / 고객 모두 < 1초 (CDN HIT) 가능
//
// I-CDN-1, I-CDN-2 보존: cron 자체는 INTERNAL_BEARER 사용하지만 실제 fetch 는
// ws_session cookie + Step T strip 패턴으로 anonymous 처럼 만들어 CDN populate.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorizedCron(req: NextRequest): boolean {
  // Vercel cron 은 자동으로 x-vercel-cron-signature 또는 cron-job-id 헤더 추가
  const cronHeader = req.headers.get('x-vercel-cron') || '';
  if (cronHeader === '1') return true;

  // Manual trigger: INTERNAL_BEARER
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : '';
  const internal = process.env.WISHES_INTERNAL_BEARER || '';
  if (internal && token && token === internal) return true;

  return false;
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();

  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  // Prod URL 자체를 호출 → middleware Step T 거치면서 CDN 정상 populate.
  // CDN cache miss 면 function 실행 → unstable_cache 갱신 + CDN populate (s-maxage=3600).
  // 다음 사용자 = CDN HIT < 100ms.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://wishes.co.kr';

  // INTERNAL_BEARER 로 인증, middleware 가 strip → CDN populate 가능
  const internal = process.env.WISHES_INTERNAL_BEARER || '';

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
          // Force fresh - tell CDN we want to populate
          cache: 'no-store',
        });
        const body = await res.text();
        const elapsed = Date.now() - t1;
        return {
          url: url.replace(baseUrl, ''),
          status: res.status,
          size: body.length,
          xVercelCache: res.headers.get('x-vercel-cache'),
          cacheControl: res.headers.get('cache-control'),
          elapsedMs: elapsed,
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
