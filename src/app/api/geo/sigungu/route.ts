// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/sigungu — L-adminpoly2 (2026-04-24 pm)
// 한국 시/군/구 경계 GeoJSON 서버 프록시
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 86400;

const SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json';

let cached: { body: string; etag: string } | null = null;

export async function GET() {
  try {
    if (!cached) {
      const r = await fetch(SOURCE_URL, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 86400 },
      });
      if (!r.ok) {
        return NextResponse.json(
          { error: 'upstream fetch failed', status: r.status },
          { status: 502 },
        );
      }
      const body = await r.text();
      cached = { body, etag: `"sigungu-${body.length}"` };
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
