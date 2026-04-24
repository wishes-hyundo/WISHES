// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 줌 레벨 → 표시 모드 자동 전환 (2026-04 재튜닝)
//
// 🎯 핵심 원칙
// "뷰포트에 들어오는 매물 수가 시각 정보량 한계(~80개) 를 넘으면 aggregate 한다."
//
// 서울 기준 대략:
//   z ≤ 11.5   → 서울 전역/구 단위 (매물 수천) → hexagon-low (r6)
//   z ≤ 13.5   → 동 단위 (매물 수백)           → hexagon-mid (r7)
//   z ≤ 15     → 단지/블록 단위 (매물 80±)     → pins
//   z > 15     → 건물 단위 (매물 수십)         → 3d
//
// L-kakao1 (2026-04-22): 지도 베이스가 Kakao 로 바뀌면서 MapLibre 전용
//   map.on('moveend')/getZoom()/getBounds() 는 더 이상 쓸 수 없다. 다행히
//   MapClient 가 이미 Kakao 의 `idle` 이벤트에서 setZoom/setBbox 를 store 로
//   쏴주고 있으므로, 본 훅은 map 인스턴스에 직접 붙지 않고 순수 store 구독으로
//   전환. 모드 결정은 store.zoom + store.listings.length 의 효과로 파생된다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect } from 'react';
import { useMap2026Store, type ZoomMode } from '../store';

// Density-aware downgrade 임계값: pins/3d 모드에서도 이 숫자 넘으면 hex 로 fallback
const PINS_MAX_VISIBLE = 200;

export function zoomToMode(zoom: number): ZoomMode {
  if (zoom < 11.5) return 'hexagon-low';
  if (zoom < 13.5) return 'hexagon-mid';
  if (zoom < 15)   return 'pins';
  return '3d';
}

/** 현재 뷰포트에 매물이 너무 많으면 한 단계 aggregate 로 강등 */
export function densityAwareMode(baseMode: ZoomMode, visibleCount: number): ZoomMode {
  if ((baseMode === 'pins' || baseMode === '3d') && visibleCount > PINS_MAX_VISIBLE) {
    return 'hexagon-mid';
  }
  return baseMode;
}

export function useSemanticZoom() {
  const zoom = useMap2026Store((s) => s.zoom);
  const listingsLength = useMap2026Store((s) => s.listings.length);
  const setMode = useMap2026Store((s) => s.setMode);

  useEffect(() => {
    setMode(densityAwareMode(zoomToMode(zoom), listingsLength));
  }, [zoom, listingsLength, setMode]);
}
