// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/sido — L-adminpoly2 (2026-04-24 pm)
// 한국 시/도 경계 GeoJSON 서버 프록시
//
// 배경:
//   AdminRegionOverlay 가 raw.githubusercontent.com 에서 GeoJSON 을 직접
//   fetch 하려 했으나 CSP (connect-src) 에 등록 안 돼 'TypeError: Failed to fetch'.
//   서버 프록시로 우회 — 같은 오리진에서 제공하므로 CSP 이슈 없음.
//
// 캐시:
//   · GitHub raw 원본은 안정 (2018년 이후 변경 없음)
//   · CDN edge cache 24시간 + SWR 7일
//   · Node 레벨 메모리 캐시로 반복 요청 시 GitHub 왕복 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 86400;  // 1일

const SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json';

// 모듈 레벨 in-memory cache (Vercel 함수 콜드 스타트 사이에는 초기화됨)
let cached: { body: string; etag: string } | null = null;

export async function GET() {
  try {
    if (!cached) {
      const r = await fetch(SOURCE_URL, {
        // 서버→서버 fetch, CSP 무관
        headers: { Accept: 'application/json' },
        // Next.js 내장 캐시에 맡김
        next: { revalidate: 86400 },
      });
      if (!r.ok) {
        return NextResponse.json(
          { error: 'upstream fetch failed', status: r.status },
          { status: 502 },
        );
      }
      const body = await r.text();
      // ETag 간단 해시 (body 길이 + 앞 100 chars 충분)
      const etag = `"sido-${body.length}"`;
      cached = { body, etag };
    }
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        ETag: cached.etag,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'internal', detail: String(e) },
      { status: 500 },
    );
  }
}
