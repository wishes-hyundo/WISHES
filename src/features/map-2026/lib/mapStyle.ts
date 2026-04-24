// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapLibre 스타일 — Carto 래스터 (2D) + OpenFreeMap 벡터 (3D 건물)
//
// 🎯 2026-04 Phase D 업그레이드
//   - Carto voyager_nolabels 를 베이스로 유지 (이미 익숙한 한국어 환경)
//   - OpenFreeMap 벡터 소스를 추가해 건물 fill-extrusion 레이어 주입
//   - threeD 토글이 켜지면 building-3d layer visibility 'visible' 로 변경
//   - 로짓 토글이 꺼져있으면 visibility 'none' 으로 두고 pitch 0
//   - 라벨 라이어는 항상 최상단에 유지 (extrusion 위로 덮이지 않도록)
// TODO(prod): VWorld 벡터 타일 전환 (https://map.vworld.kr/map/apis.do)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { StyleSpecification } from 'maplibre-gl';

export const BUILDING_3D_LAYER_ID = 'buildings-3d';

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OSM · © CARTO · © OpenFreeMap',
        maxzoom: 19,
      },
      labels: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
      },
      // OpenFreeMap planet 벡터 타일 (무료·API키 불필요)
      // Building height 는 render_height / height / min_height 등 속성에 들어있음
      openfreemap: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
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
      // 3D 건물 — threeD 토글이 꺼진 초기 상태에서는 visibility none
      {
        id: BUILDING_3D_LAYER_ID,
        type: 'fill-extrusion',
        source: 'openfreemap',
        'source-layer': 'building',
        minzoom: 14,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
            0,  '#e5e7eb',
            30, '#d4d4d8',
            80, '#a1a1aa',
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.82,
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
