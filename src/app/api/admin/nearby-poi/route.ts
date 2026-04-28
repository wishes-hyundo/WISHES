// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/admin/nearby-poi (2026-04-29)
//   카카오 Local API 기반 주변 시설: 지하철역 (SW8) + 버스정류장 (BS3)
//   사장님 명령: '100% 정확한 위치 기반 카카오기반'
//   - radius 1500m, sort=distance, size=5
//   - 도보 분: 80m/분 (네이버·KB 표준)
//   - 비용: 카카오 무료 일 100K 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

interface PoiItem {
  name: string;
  distance_m: number;
  walk_min: number;
  line?: string;
}

async function searchKakao(category: 'SW8' | 'BS3', lat: number, lng: number): Promise<PoiItem[]> {
  if (!KAKAO_REST_API_KEY) return [];
  const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category}&x=${lng}&y=${lat}&radius=1500&sort=distance&size=5`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { documents?: Array<{ place_name: string; distance: string; category_name?: string }> };
    return (j.documents || []).map((d) => {
      const dist = parseInt(d.distance || '0', 10);
      const item: PoiItem = {
        name: d.place_name,
        distance_m: dist,
        walk_min: Math.max(1, Math.round(dist / 80)),
      };
      // 지하철역의 경우 호선 추출 (category_name 의 마지막 부분)
      if (category === 'SW8' && d.category_name) {
        // 예: '교통,수송 > 지하철,전철 > 수도권2호선 > 신림역'
        const parts = d.category_name.split('>').map((s) => s.trim());
        const lineHint = parts[parts.length - 2];
        if (lineHint && /호선|선/.test(lineHint)) item.line = lineHint;
      }
      return item;
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ success: false, error: 'lat/lng required' }, { status: 400 });
  }
  const [subway, bus] = await Promise.all([
    searchKakao('SW8', lat, lng),
    searchKakao('BS3', lat, lng),
  ]);
  return NextResponse.json({ success: true, subway, bus });
}
