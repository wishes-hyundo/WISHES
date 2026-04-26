// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IsochroneOverlay — 도달시간 등고선 (4단계 활성화)
//
// L-naver-2026isochrone1 (2026-04-27): isochroneLayer.ts (deck.gl) 인프라는 있지만
//   deck.gl 통합 미연결 → 카카오 Polygon 으로 직접 렌더 (가장 빠른 활성화).
//
// 동작:
//   · isochrone 토글 ON + center 있으면 useIsochrone hook 이 자동 fetch
//   · payload.polygons 를 카카오 Polygon 으로 그림 (그린 fill, 사용자 시각적 인지)
//   · OFF / unmount 시 자동 cleanup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { useMap2026Store } from '../store';
import { useIsochrone } from '../hooks/useIsochrone';

interface KakaoPolygon { setMap: (m: unknown) => void; setOptions?: (o: Record<string, unknown>) => void }
interface KakaoMapsNs {
  Polygon: new (opts: Record<string, unknown>) => KakaoPolygon;
  LatLng: new (lat: number, lng: number) => unknown;
}
interface KakaoNs { maps?: KakaoMapsNs }

interface Props {
  map: unknown;
}

export default function IsochroneOverlay({ map }: Props) {
  // useIsochrone 자동 fetch trigger
  useIsochrone();

  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const isochroneOn = useMap2026Store((s) => s.isochrone);
  const payload = useMap2026Store((s) => s.isochronePayload);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNs }).kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;

    // cleanup 이전 polygons
    for (const p of polygonsRef.current) {
      try { p.setMap(null); } catch { /*noop*/ }
    }
    polygonsRef.current = [];

    if (!isochroneOn || !payload || !payload.polygons.length) return;

    // L-naver-2026isochrone1: 그린 그라디언트 (가까울수록 진하게).
    //   다중 polygon (5/10/15분 등 step) → 시각적 깊이감.
    for (let idx = 0; idx < payload.polygons.length; idx++) {
      const feat = payload.polygons[idx];
      const geom = feat.geometry;
      if (geom.type !== 'Polygon') continue;
      const ring = geom.coordinates[0];
      if (!ring || ring.length < 3) continue;
      const path = ring.map(([lng, lat]) => new maps.LatLng(lat, lng));
      // 안쪽 polygon 더 진하게 (idx 작을수록 안쪽)
      const ratio = (idx + 1) / payload.polygons.length;
      const opacity = 0.15 + (1 - ratio) * 0.20;  // 0.15~0.35
      try {
        const polygon = new maps.Polygon({
          path,
          strokeWeight: 2,
          strokeColor: '#16a34a',
          strokeOpacity: 0.7,
          fillColor: '#16a34a',
          fillOpacity: opacity,
          clickable: false,
          zIndex: 5,
        });
        polygon.setMap(map);
        polygonsRef.current.push(polygon);
      } catch (e) {
        console.error('[isochrone] polygon create fail', e);
      }
    }

    return () => {
      for (const p of polygonsRef.current) {
        try { p.setMap(null); } catch { /*noop*/ }
      }
      polygonsRef.current = [];
    };
  }, [map, isochroneOn, payload]);

  return null;
}
