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

import { useEffect, useRef } from 'react';
import { useMap2026Store } from '../store';

export function useIsochrone() {
  const on = useMap2026Store((s) => s.isochrone);
  const center = useMap2026Store((s) => s.isochroneCenter);
  const minutes = useMap2026Store((s) => s.isochroneMinutes);
  const setPayload = useMap2026Store((s) => s.setIsochronePayload);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const listings = useMap2026Store((s) => s.listings);
  const setCenter = useMap2026Store((s) => s.setIsochroneCenter);

  // L-mapfix4 (2026-04-22): listings 는 ref 로 읽고 deps 에서 뺀다.
  //   기존엔 크롤러 refetch 로 listings 가 갱신될 때마다 선택 매물 좌표가
  //   다시 setCenter 로 써져서 isochrone API 가 불필요하게 재요청됐음.
  const listingsRef = useRef(listings);
  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  // 선택 매물이 있으면 그 좌표를 자동 center 로 (selectedId 변경 시에만 반응)
  useEffect(() => {
    if (!on) return;
    if (selectedId == null) return;
    const l = listingsRef.current.find((x) => x.id === selectedId);
    if (l) setCenter([l.lng, l.lat]);
  }, [on, selectedId, setCenter]);

  // center/minutes 바뀌면 fetch
  useEffect(() => {
    if (!on) {
      setPayload(null);
      return;
    }
    if (!center) return;
    const ctrl = new AbortController();
    const url = `/api/map/isochrone?lng=${center[0]}&lat=${center[1]}&minutes=${minutes}`;
    // L-ux3c (2026-04-22): 실패 시 payload 를 확실히 날려서
    //   stale 등고선이 지도에 남아 오해의 소지로 작용하지 않도록.
    //   또한 non-OK HTTP 를 모두 throw 해 catch 로 흡수하게 하고,
    //   정상 abort 는 조용히 지나가도록 유지.
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`isochrone ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setPayload({
          center: data.center,
          minutes: data.minutes,
          polygons: data.polygons ?? [],
        });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // 실패 시 stale polygon 을 반드시 제거 — 아무것도 안 보이는 게 잘못된 등고선보다 낫다.
        setPayload(null);
        console.warn('[useIsochrone]', err);
      });
    return () => ctrl.abort();
  }, [on, center, minutes, setPayload]);
}
