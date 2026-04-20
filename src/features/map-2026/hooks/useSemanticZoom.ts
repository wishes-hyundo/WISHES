// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 줌 레벨 → 표시 모드 자동 전환
// < 11   : 지역 개요 (H3 r6)
// < 12.5 : 클러스터  (H3 r7)
// < 14   : 매물 핀
//  ≥ 14  : 건물 클러스터 (3D)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect } from 'react';
import { useMap2026Store, type ZoomMode } from '../store';

export function zoomToMode(zoom: number): ZoomMode {
  if (zoom < 11) return 'hexagon-low';
  if (zoom < 12.5) return 'hexagon-mid';
  if (zoom < 14) return 'pins';
  return '3d';
}

export function useSemanticZoom() {
  const map = useMap2026Store((s) => s.map);
  const setZoom = useMap2026Store((s) => s.setZoom);
  const setMode = useMap2026Store((s) => s.setMode);
  const setBbox = useMap2026Store((s) => s.setBbox);

  useEffect(() => {
    if (!map) return;

    const emit = () => {
      const z = map.getZoom();
      const b = map.getBounds();
      setZoom(z);
      setMode(zoomToMode(z));
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
}
