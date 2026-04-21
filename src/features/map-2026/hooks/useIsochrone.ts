// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useIsochrone — 통근 등고선 자동 fetch
//
// 트리거:
//   1) isochrone 토글이 켜져있고
//   2) isochroneCenter 가 있을 때 (선택 매물 → 자동 세팅 or 맵 long-press)
//   → /api/map/isochrone?lng=..&lat=..&minutes=.. 호출 → payload 저장
// 언마운트 / 토글 off 시 payload 자동 clear
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect } from 'react';
import { useMap2026Store } from '../store';

export function useIsochrone() {
  const on = useMap2026Store((s) => s.isochrone);
  const center = useMap2026Store((s) => s.isochroneCenter);
  const minutes = useMap2026Store((s) => s.isochroneMinutes);
  const setPayload = useMap2026Store((s) => s.setIsochronePayload);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const listings = useMap2026Store((s) => s.listings);
  const setCenter = useMap2026Store((s) => s.setIsochroneCenter);

  // 선택 매물이 있으면 그 좌표를 자동 center 로
  useEffect(() => {
    if (!on) return;
    if (selectedId == null) return;
    const l = listings.find((x) => x.id === selectedId);
    if (l) setCenter([l.lng, l.lat]);
  }, [on, selectedId, listings, setCenter]);

  // center/minutes 바뀌면 fetch
  useEffect(() => {
    if (!on) {
      setPayload(null);
      return;
    }
    if (!center) return;
    const ctrl = new AbortController();
    const url = `/api/map/isochrone?lng=${center[0]}&lat=${center[1]}&minutes=${minutes}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setPayload({
          center: data.center,
          minutes: data.minutes,
          polygons: data.polygons ?? [],
        });
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('[useIsochrone]', err);
        }
      });
    return () => ctrl.abort();
  }, [on, center, minutes, setPayload]);
}
