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
// 예전 경계(z<11 / z<12.5 / z<14) 는 pins 모드가 지나치게 일찍 등장해서
// "너저분한 마커 수백 개" 의 주범이었음.
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
  const map = useMap2026Store((s) => s.map);
  const listings = useMap2026Store((s) => s.listings);
  const setZoom = useMap2026Store((s) => s.setZoom);
  const setMode = useMap2026Store((s) => s.setMode);
  const setBbox = useMap2026Store((s) => s.setBbox);

  useEffect(() => {
    if (!map) return;

    const emit = () => {
      const z = map.getZoom();
      const b = map.getBounds();
      setZoom(z);
      setMode(densityAwareMode(zoomToMode(z), listings.length));
      setBbox({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    };

    emit();
    map.on('moveend', emit);
    map.on('zoomend', emit);

    return () => {
      map.off('moveend', emit);
      map.off('zoomend', emit);
    };
  }, [map, listings.length, setZoom, setMode, setBbox]);
}
