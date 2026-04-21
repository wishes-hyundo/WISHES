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
//
// L-mapfix3 (2026-04-22): listings.length 를 deps 에서 빼고 ref 로 읽는다.
//   크롤러 배치 refetch 가 들어올 때마다 moveend/zoomend 가 off→on 으로
//   재바인딩되어, 리스너가 0 개인 레이스 윈도가 열리던 문제를 차단.
//   density 재평가는 별도 effect 에서 listings.length 변화에만 반응.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect, useRef } from 'react';
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
  const listingsLength = useMap2026Store((s) => s.listings.length);
  const setZoom = useMap2026Store((s) => s.setZoom);
  const setMode = useMap2026Store((s) => s.setMode);
  const setBbox = useMap2026Store((s) => s.setBbox);

  // listings.length 를 ref 로 스냅샷해 moveend/zoomend 핸들러가
  // 재바인딩 없이 최신 값을 읽도록. (L-mapfix3)
  const listingsLengthRef = useRef(listingsLength);
  useEffect(() => {
    listingsLengthRef.current = listingsLength;
  }, [listingsLength]);

  // 1) map 준비되면 단 한 번 moveend/zoomend 바인딩.
  useEffect(() => {
    if (!map) return;

    const emit = () => {
      const z = map.getZoom();
      const b = map.getBounds();
      setZoom(z);
      setMode(densityAwareMode(zoomToMode(z), listingsLengthRef.current));
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
  }, [map, setZoom, setMode, setBbox]);

  // 2) listings 수가 달라지면 현재 줌에 대해 density 를 재평가.
  //    (viewport 이벤트 없이 순수 데이터 변경으로 모드 강등/승격이 일어나야 하는 경우)
  useEffect(() => {
    if (!map) return;
    const z = map.getZoom();
    setMode(densityAwareMode(zoomToMode(z), listingsLength));
  }, [map, listingsLength, setMode]);
}
