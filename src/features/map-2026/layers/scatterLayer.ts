// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scatter layer — hero 아닌 매물 = 배경 컨텍스트 (2026-04 재디자인)
//
// 🎯 원칙: hero 가 주연, 이 레이어는 조명.
//   - pins/3d 모드에서 hero 외 매물 = 작고 연한 회색 점
//   - 시세 −10% 이하인 "히든 오퍼튜니티" 는 작은 녹점으로 강조
//   - 나머지는 신경 거슬리지 않게 opacity 40%
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
    stroked: false,
    filled: true,
    radiusUnits: 'pixels',
    getPosition: (d) => [d.lng, d.lat],
    getRadius: (d) =>
      // 시세 대비 확실히 싼 매물은 약간 더 크게 (시선 유도)
      d.median_deviation != null && d.median_deviation <= -0.1 ? 4.5 : 2.75,
    getFillColor: (d) => {
      // 히든 오퍼튜니티만 녹색 강조, 나머지는 뉴트럴 회색 (opacity 낮게)
      if (d.median_deviation != null && d.median_deviation <= -0.1) {
        return [22, 163, 74, 220]; // emerald-600 · 알파 높음
      }
      return [100, 116, 139, 110];  // slate-500 · 알파 낮음 (약 43%)
    },
    onHover,
    onClick,
    // L-mapfix4: updateTriggers 에 listings.length 만 넣는 건 무의미.
    //   data prop 의 reference 가 바뀌면 deck.gl 이 accessor 를 자동 재실행하고,
    //   length 가 동일한데 내용만 바뀌는 경우엔 오히려 누락됨. accessor 가
    //   외부 클로저 값을 캡처하지 않으므로 updateTriggers 자체가 불필요.
  });
}
