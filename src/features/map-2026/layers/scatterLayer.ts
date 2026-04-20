// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scatter layer — hero 가 아닌 매물을 얇은 점으로
// (hero 는 HTML DOM pin 으로 별도 렌더, 이 레이어는 배경 맥락용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { MapListing } from '../store';

export function buildScatterLayer(
  listings: MapListing[],
  onHover?: (info: PickingInfo<MapListing>) => void,
  onClick?: (info: PickingInfo<MapListing>) => void
) {
  return new ScatterplotLayer<MapListing>({
    id: 'scatter-non-hero',
    data: listings,
    pickable: true,
    stroked: true,
    filled: true,
    radiusUnits: 'pixels',
    getPosition: (d) => [d.lng, d.lat],
    getRadius: 4,
    getFillColor: (d) => {
      if (d.median_deviation == null) return [120, 120, 120, 200];
      if (d.median_deviation <= -0.05) return [22, 163, 74, 230];    // 싼 매물 = 그린
      if (d.median_deviation >= 0.05) return [239, 68, 68, 200];     // 비싼 매물 = 레드
      return [156, 163, 175, 200];                                   // 시세 = 그레이
    },
    getLineColor: [255, 255, 255, 220],
    lineWidthMinPixels: 1,
    onHover,
    onClick,
    updateTriggers: {
      getFillColor: [listings.length],
    },
  });
}
