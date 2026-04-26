// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/legaldong/sigungu/[code] — L-naver-2026legalunion1 (2026-04-26)
//
// 시군구 code 별 법정동(法定洞) 단위 GeoJSON.  네이버처럼 1 법정동 = 1
// polygon 으로 합쳐서 응답.  같은 법정동 안의 행정동 (e.g. 신림1~11동, 서원동,
// 신원동, ...) 11개를 turf.union 으로 1개 polygon 으로 merge → 시각적으로
// "조각이 나" 보이지 않음.
//
// 배경:
//   · KOSTAT GeoJSON 은 행정동 (admin) 단위.  네이버는 법정동 (legal) 단위.
//   · 클라에서 행정동 11개를 각각 polygon 으로 그리면 fillOpacity 가 stack
//     되어 같은 신림동 안에서도 진한/옅은 영역이 나뉘어 보임 (사용자 피드백).
//   · 서버에서 미리 union → 시군구당 1번 계산 + cache → 모든 사용자 빠르게.
//
// 동작:
//   · /api/geo/legaldong/sigungu/11210 → 관악구 법정동 3개 (신림·봉천·남현)
//   · 행정동 → 법정동 매핑은 legalDongMap.ts (서울 8구 + regex fallback)
//   · 응답: { type: 'FeatureCollection', features: [<신림동>, <봉천동>, <남현동>] }
//   · 각 feature.properties.name = 법정동명, .code = 행정동 code prefix (8자리)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';
import union from '@turf/union';
import { featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from 'geojson';
import { adminToLegalDong } from '@/features/map-2026/lib/legalDongMap';

export const dynamic = 'force-dynamic';
// L-naver-2026edge2: Node Runtime.  @turf/union 의 polygon-clipping 의존성이
//   Edge 에서 일부 ICU 호환 이슈 가능 → 안전하게 Node Runtime 으로 fallback.
//   결과는 캐시되므로 cold start 차이 무시 가능.
export const runtime = 'nodejs';
export const revalidate = 86400;

const DONG_SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-submunicipalities-2018-geo.json';
const SIG_SOURCE_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json';

interface RawFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    name?: string;
    name_eng?: string;
    code?: string;
    [k: string]: unknown;
  };
}

let dongUpstream: { features: RawFeature[]; ts: number } | null = null;
let sigUpstream: { features: RawFeature[]; ts: number } | null = null;
const legalCache = new Map<string, { body: string; etag: string }>();

async function ensureDongUpstream(): Promise<RawFeature[]> {
  if (dongUpstream && Date.now() - dongUpstream.ts < 86400_000) {
    return dongUpstream.features;
  }
  const r = await fetch(DONG_SOURCE_URL, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });
  if (!r.ok) throw new Error(`dong upstream ${r.status}`);
  const data = (await r.json()) as { features?: RawFeature[] };
  const features = Array.isArray(data?.features) ? data.features : [];
  dongUpstream = { features, ts: Date.now() };
  return features;
}

async function ensureSigUpstream(): Promise<RawFeature[]> {
  if (sigUpstream && Date.now() - sigUpstream.ts < 86400_000) {
    return sigUpstream.features;
  }
  const r = await fetch(SIG_SOURCE_URL, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });
  if (!r.ok) throw new Error(`sigungu upstream ${r.status}`);
  const data = (await r.json()) as { features?: RawFeature[] };
  const features = Array.isArray(data?.features) ? data.features : [];
  sigUpstream = { features, ts: Date.now() };
  return features;
}

/** 시군구 code (5자리) → 시군구 한글 이름 lookup. */
async function sigunguCodeToName(code: string): Promise<string> {
  const sigs = await ensureSigUpstream();
  for (const s of sigs) {
    const sCode = String(s.properties?.code ?? '');
    if (sCode === code || sCode.slice(0, 5) === code) {
      const name = String(s.properties?.name ?? '').trim();
      if (name) return name;
    }
  }
  return '';
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
    const cached = legalCache.get(code);
    if (cached) {
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          ETag: cached.etag,
          'X-Wishes-Chunk': `legaldong/${code}`,
          'X-Wishes-Cache': 'HIT',
        },
      });
    }

    const [dongAll, sigName] = await Promise.all([
      ensureDongUpstream(),
      sigunguCodeToName(code),
    ]);

    // Filter dong features by sigungu code prefix.
    const adminDongs = dongAll.filter((f) => {
      const c = String(f.properties?.code ?? '');
      return c.length >= 5 && c.slice(0, 5) === code;
    });

    if (adminDongs.length === 0) {
      const empty = JSON.stringify({ type: 'FeatureCollection', features: [] });
      const etag = `"legaldong-${code}-empty"`;
      legalCache.set(code, { body: empty, etag });
      return new NextResponse(empty, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          ETag: etag,
          'X-Wishes-Features': '0',
        },
      });
    }

    // Group by legal dong name.
    const groups = new Map<string, RawFeature[]>();
    for (const f of adminDongs) {
      const adminName = String(f.properties?.name ?? '').trim();
      if (!adminName) continue;
      const legal = adminToLegalDong(adminName, sigName) || adminName;
      const arr = groups.get(legal) ?? [];
      arr.push(f);
      groups.set(legal, arr);
    }

    // Union each group.
    const legalFeatures: Feature<Polygon | MultiPolygon>[] = [];
    for (const [legalName, feats] of groups) {
      let merged: Feature<Polygon | MultiPolygon> | null = null;
      if (feats.length === 1) {
        merged = {
          type: 'Feature',
          properties: {},
          geometry: feats[0].geometry,
        } as Feature<Polygon | MultiPolygon>;
      } else {
        try {
          const fc = featureCollection(feats) as FeatureCollection<Polygon | MultiPolygon>;
          merged = union(fc) as Feature<Polygon | MultiPolygon> | null;
        } catch (e) {
          console.error('[legaldong] union fail', legalName, e);
          // fallback: use first feature only — better than crash
          merged = {
            type: 'Feature',
            properties: {},
            geometry: feats[0].geometry,
          } as Feature<Polygon | MultiPolygon>;
        }
      }
      if (!merged) continue;
      const sampleCode = String(feats[0].properties?.code ?? '');
      legalFeatures.push({
        type: 'Feature',
        properties: {
          name: legalName,
          name_eng: legalName,  // simplified — eng 매핑 별도 필요 시 추가
          code: sampleCode.slice(0, 5),  // sigungu code 5자리만
          adminCount: feats.length,
        },
        geometry: merged.geometry,
      });
    }

    const body = JSON.stringify({ type: 'FeatureCollection', features: legalFeatures });
    const etag = `"legaldong-${code}-${legalFeatures.length}-${body.length}"`;
    legalCache.set(code, { body, etag });

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        ETag: etag,
        'X-Wishes-Chunk': `legaldong/${code}`,
        'X-Wishes-Features': String(legalFeatures.length),
        'X-Wishes-Admin-Count': String(adminDongs.length),
        'X-Wishes-Sigungu-Name': encodeURIComponent(sigName),
      },
    });
  } catch (e) {
    console.error('[geo/legaldong/sigungu] fatal', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
