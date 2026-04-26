// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/dong — L-naverstyle1 (2026-04-24 pm)
// 한국 읍/면/동 경계 GeoJSON 서버 프록시 (simplified, 약 1.7MB)
//
// 배경:
//   네이버 부동산 스타일 (시/도 → 시/군/구 → 동 → 단지) 4-level 클러스터링
//   완성을 위해 level 4~6 (block ~ neighborhood) 에서 동 폴리곤/chip 표시.
//
// 데이터 소스:
//   southkorea-maps/kostat/2018/json/skorea-submunicipalities-2018-geo.json
//   (~34MB, 전국 읍/면/동, full detail).
//   L-naver-precise1 (2026-04-26): simplified 버전 (1.7MB, 평균 7 points/feature)
//   는 폴리곤이 사각형처럼 거칠어 jagged 모양. full 버전 (평균 48 pts) 으로
//   정밀하고 깔끔한 boundary.
//
// 캐시:
//   · CDN edge 24 시간 + 7 일 SWR
//   · Node 모듈 레벨 메모리 캐시 — cold start 외 1 hop 재요청 0
//   · 클라이언트 first load 가 무거운 대신 (34MB), 이후엔 cache hit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';

// L-naver-precise1: 34MB 데이터를 build 에 baking 안 하도록 dynamic 으로 변경.
//   런타임에 fetch + Node 메모리 캐시 + Edge SWR 로 충분.
export const dynamic = 'force-dynamic';
export const revalidate = 86400;

const SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-submunicipalities-2018-geo.json';

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
