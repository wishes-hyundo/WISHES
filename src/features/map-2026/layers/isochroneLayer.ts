// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 통근 시간 등고선 — GeoJSON Polygon
// 서버에서 Kakao Mobility API 로 계산 → isochrone_cache 에 저장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Feature, Polygon, FeatureCollection } from 'geojson';

export interface IsochronePayload {
  center: [number, number];
  minutes: number;
  polygons: Feature<Polygon>[];
}

export function buildIsochroneLayer(payload: IsochronePayload | null) {
  if (!payload || payload.polygons.length === 0) return null;

  const fc: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: payload.polygons,
  };

  return new GeoJsonLayer({
    id: 'isochrone',
    data: fc,
    pickable: false,
    stroked: true,
    filled: true,
    getFillColor: [22, 163, 74, 40],
    getLineColor: [22, 163, 74, 220],
    lineWidthMinPixels: 2,
  });
}
