// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/dong/sigungu/[code] — L-naver-2026chunk1 (2026-04-26)
// 시군구 code 별 dong GeoJSON chunk.  전국 33MB 한 번 로드 대신 시군구별
// ~50KB 만 받음 (750x 감소).
//
// 배경:
//   /api/geo/dong (full, 33MB) 를 클라가 한 번에 로드하면 모바일 데이터 +
//   메인 스레드 파싱 부담 큼.  네이버처럼 viewport 의 시군구만 lazy-load.
//
// 동작:
//   · /api/geo/dong/sigungu/11210 → 관악구 dong feature 21개 (~44KB)
//   · code prefix matching (code.slice(0,5) === sigunguCode)
//   · 첫 호출 시 upstream 33MB 로드 + 모듈 메모리 캐시.  이후는 즉시 응답.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;

const SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-submunicipalities-2018-geo.json';

interface DongFeature {
  type: 'Feature';
  properties: { name?: string; name_eng?: string; code?: string; [k: string]: unknown };
  geometry: unknown;
}

let upstreamCache: { features: DongFeature[]; ts: number } | null = null;
const chunkCache = new Map<string, { body: string; etag: string }>();

async function ensureUpstream(): Promise<DongFeature[]> {
  if (upstreamCache && Date.now() - upstreamCache.ts < 86400_000) {
    return upstreamCache.features;
  }
  const r = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const data = (await r.json()) as { features?: DongFeature[] };
  const features = Array.isArray(data?.features) ? data.features : [];
  upstreamCache = { features, ts: Date.now() };
  return features;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  try {
    const { code } = await ctx.params;
    if (!/^\d{5}$/.test(code)) {
      return NextResponse.json(
        { error: 'invalid code (expected 5 digits)' },
        { status: 400 },
      );
    }

    // chunk cache hit
    const cached = chunkCache.get(code);
    if (cached) {
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          ETag: cached.etag,
          'X-Wishes-Chunk': `dong/${code}`,
        },
      });
    }

    const features = await ensureUpstream();
    const filtered = features.filter((f) => {
      const c = String((f.properties as { code?: string })?.code ?? '');
      return c.length >= 5 && c.slice(0, 5) === code;
    });

    const body = JSON.stringify({ type: 'FeatureCollection', features: filtered });
    const etag = `"dong-${code}-${filtered.length}-${body.length}"`;
    chunkCache.set(code, { body, etag });

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        ETag: etag,
        'X-Wishes-Chunk': `dong/${code}`,
        'X-Wishes-Features': String(filtered.length),
      },
    });
  } catch (e) {
    console.error('[geo/dong/sigungu] fatal', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
