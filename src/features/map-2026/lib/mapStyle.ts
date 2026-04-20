// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapLibre 스타일 — 미니멀 데사튜레이션, 한국 환경 최적화
// TODO(prod): VWorld 벡터 타일 전환 (https://map.vworld.kr/map/apis.do)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { StyleSpecification } from 'maplibre-gl';

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OSM · © CARTO',
        maxzoom: 19,
      },
      labels: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#fafafa' } },
      {
        id: 'base',
        type: 'raster',
        source: 'base',
        paint: {
          'raster-saturation': -0.35,
          'raster-contrast': -0.05,
          'raster-brightness-min': 0.05,
        },
      },
      {
        id: 'labels',
        type: 'raster',
        source: 'labels',
        paint: { 'raster-opacity': 0.9 },
      },
    ],
  };
}
