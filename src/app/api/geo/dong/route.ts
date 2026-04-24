// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/dong — L-naverstyle1 (2026-04-24 pm)
// 한국 읍/면/동 경계 GeoJSON 서버 프록시 (simplified, 약 1.7MB)
//
// 배경:
//   네이버 부동산 스타일 (시/도 → 시/군/구 → 동 → 단지) 4-level 클러스터링
//   완성을 위해 level 4~6 (block ~ neighborhood) 에서 동 폴리곤/chip 표시.
//
// 데이터 소스:
//   southkorea-maps/kostat/2013/json/skorea_submunicipalities_geo_simple.json
//   (~1.73MB, 전국 읍/면/동).  2013 기준이지만 동 경계는 대부분 변경 없음.
//
// 캐시:
//   · CDN edge 24 시간 + 7 일 SWR
//   · Node 모듈 레벨 메모리 캐시 — cold start 외 1 hop 재요청 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 86400;  // 1일

const SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_submunicipalities_geo_simple.json';

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
      const etag = `"dong-${body.length}"`;
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
    console.error('[geo/dong] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
