// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/isochrone — 통근 등고선 폴리곤
//
// Phase 1.0: Haversine 기반 원형 등고선 (placeholder)
// Phase 1.1: Kakao Mobility API → isochrone_cache 저장 → 실제 도로망 기반
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';

function buildCircle(center: [number, number], radiusKm: number, steps = 72) {
  const [lng, lat] = center;
  const R = 6371;
  const d = radiusKm / R;
  const coords: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const lat1 = (lat * Math.PI) / 180;
    const lon1 = (lng * Math.PI) / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg)
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const minutes = Math.min(60, Math.max(5, parseInt(searchParams.get('minutes') ?? '15', 10)));

  if (Number.isNaN(lng) || Number.isNaN(lat)) {
    return NextResponse.json({ error: 'invalid center' }, { status: 400 });
  }

  // 평균 도시 통근속도 가정: 버스 18km/h, 지하철 30km/h 혼합 → 20km/h
  const radiusKm = (minutes / 60) * 20;
  const ring = buildCircle([lng, lat], radiusKm);

  return NextResponse.json(
    {
      center: [lng, lat],
      minutes,
      polygons: [
        {
          type: 'Feature',
          properties: { minutes },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    },
    { headers: { 'Cache-Control': 'public, max-age=600' } }
  );
}
