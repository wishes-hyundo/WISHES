// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/geo/legaldong/sigungu/[code] — P5-5 (2026-05-21)
//
// VWorld(국토부 디지털트윈국토) LT_C_ADEMD_INFO 법정동(法定洞) 경계
// 정적 GeoJSON 서빙. /map(map-2026 AdminRegionOverlay) 호환용.
//
// 배경:
//   · 기존: KOSTAT 행정동을 불완전 매핑 + turf.union → 법정동 흉내
//     → 조각/공백 발생 (다방·네이버는 정부 법정동 원본 사용).
//   · 교체: VWorld 데이터 API 로 전국 법정동 5,066개 수집 →
//     public/geo/legaldong/{vsig5}.json (시군구별 255개) 정적 서빙.
//
// 동작:
//   · 들어오는 code = KOSTAT 시군구 5자리 (e.g. 11210 관악구).
//   · KOSTAT_TO_VWORLD 로 VWorld 시군구 코드(emd_cd 5자리, e.g. 11620) 변환.
//   · public/geo/legaldong/{vsig5}.json 파일을 그대로 반환.
//   · /search-2026 SearchRegionLayer 는 manifest 로 직접 정적 파일을
//     로드하므로 이 라우트를 쓰지 않음 — 이 라우트는 /map 전용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { KOSTAT_TO_VWORLD } from './kostatToVworld';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fileCache = new Map<string, string>();
const EMPTY = JSON.stringify({ type: 'FeatureCollection', features: [] });

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await ctx.params;
  if (!/^\d{5}$/.test(code)) {
    return NextResponse.json(
      { error: 'invalid code (expected 5 digits)' },
      { status: 400 },
    );
  }

  // KOSTAT 시군구 코드 → VWorld 시군구 코드. 매핑 없으면 그대로 시도.
  const vsig5 = KOSTAT_TO_VWORLD[code] ?? code;

  let body = fileCache.get(vsig5);
  if (body === undefined) {
    try {
      const fp = path.join(
        process.cwd(), 'public', 'geo', 'legaldong', `${vsig5}.json`,
      );
      body = await fs.readFile(fp, 'utf-8');
    } catch {
      body = EMPTY;
    }
    fileCache.set(vsig5, body);
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'X-Wishes-Legaldong': `${code}->${vsig5}`,
    },
  });
}
