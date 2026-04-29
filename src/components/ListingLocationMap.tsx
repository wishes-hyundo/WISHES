'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, Unlock, MapPin } from 'lucide-react';

declare global {
  interface Window {
    kakao: any;
  }
}

interface Props {
  lat: number;
  lng: number;
  address?: string | null;
  title?: string | null;
  // L-listings-merge6 (2026-04-29 사장님 명령): 비로그인 = Circle 100m + 주소 X.
  //   로그인 = Marker + 주소 X (InfoWindow 둘 다 제거).
  authed?: boolean;
}

/**
 * 매물 소재지 위치를 반영하는 카카오 지도.
 * - 기본값: 락(자물쇠) 상태 → 드래그/확대축소/휠 모두 비활성화, 고정 상태.
 * - 락을 풀면 드래그, 휠 줌, 더블클릭 줌, 확대축소 컨트롤이 모두 활성화.
 */
export default function ListingLocationMap({ lat, lng, address, title, authed = false }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const zoomControlRef = useRef<any>(null);
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!lat || !lng) return;

    const initMap = () => {
      const { kakao } = window;
      if (!kakao?.maps) return;

      kakao.maps.load(() => {
        const container = mapRef.current;
        if (!container) return;

        const center = new kakao.maps.LatLng(lat, lng);
        const map = new kakao.maps.Map(container, { center, level: 4 });
        kakaoMapRef.current = map;

        // L-listings-merge6 (2026-04-29 사장님 명령): authed 분기.
        //   - 로그인: 정확한 Marker (주소 InfoWindow 제거)
        //   - 비로그인: Circle 반경 100m 불투명 fill (대략 위치만 노출)
        // L-priv-debug (2026-04-29): 사장님 진단용 console.log
        console.log('[ListingLocationMap] authed=' + authed + ' lat=' + lat + ' lng=' + lng);
        if (authed) {
          // 로그인 사용자: 정확한 마커
          new kakao.maps.Marker({ position: center, map });
        } else {
          // L-priv-noise (2026-04-29 사장님 명령): 비로그인 — Circle 100m + 좌표 noise.
          //   정확한 lat/lng 로 Circle 그리면 사용자가 좌표 inspect 가능.
          //   ±0.00045° (~50m) 시드 노이즈 적용 → 매물 ID 기반 결정론적 (로드 시마다 동일)
          //   Circle 100m radius 안에 매물이 있다는 것만 노출 (정확한 점 X)
          const seed = Math.abs(((lat * 17 + lng * 31) * 1000) | 0);
          const r1 = ((seed % 1000) / 1000 - 0.5) * 0.0009;   // ±~50m lat
          const r2 = (((seed >> 10) % 1000) / 1000 - 0.5) * 0.0009;
          const blurredCenter = new kakao.maps.LatLng(lat + r1, lng + r2);
          map.setCenter(blurredCenter);
          new kakao.maps.Circle({
            map,
            center: blurredCenter,
            radius: 100,                          // meters
            strokeWeight: 2,
            strokeColor: '#10b981',               // emerald-500
            strokeOpacity: 0.5,
            strokeStyle: 'solid',
            fillColor: '#10b981',
            fillOpacity: 0.20,
          });
        }
        void address; void title;  // 사장님 명령: 주소 노출 X (사용 안 함)

        // 기본값: 락 상태
        map.setDraggable(false);
        map.setZoomable(false);

        // 확대축소 컨트롤은 참조만 저장 → 락 해제 시 부착
        zoomControlRef.current = new kakao.maps.ZoomControl();
      });
    };

    if (window.kakao?.maps) {
      initMap();
    } else {
      const interval = setInterval(() => {
        if (window.kakao?.maps) {
          clearInterval(interval);
          initMap();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [lat, lng, address, title]);

  // 락 상태가 바뀔 때 맵의 상호작용 가능 여부 토글
  useEffect(() => {
    const map = kakaoMapRef.current;
    const { kakao } = window;
    if (!map || !kakao?.maps) return;

    if (locked) {
      map.setDraggable(false);
      map.setZoomable(false);
      if (zoomControlRef.current) {
        try {
          map.removeControl(zoomControlRef.current);
        } catch {}
      }
    } else {
      map.setDraggable(true);
      map.setZoomable(true);
      if (zoomControlRef.current) {
        try {
          map.addControl(zoomControlRef.current, kakao.maps.ControlPosition.RIGHT);
        } catch {}
      }
    }
  }, [locked]);

  if (!lat || !lng) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
        <MapPin className="w-4 h-4" />
        위치 좌표 정보가 없습니다
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden border border-gray-100"
        style={{ height: 240 }}
      />

      {/* 락 토글 버튼 (아이콘 전용) */}
      <button
        type="button"
        onClick={() => setLocked((v) => !v)}
        className={`absolute top-3 left-3 z-10 w-9 h-9 flex items-center justify-center rounded-full shadow-md backdrop-blur transition-all ${
          locked
            ? 'bg-white/95 text-gray-700 border border-gray-200 hover:bg-white'
            : 'bg-wishes-primary text-white border border-wishes-primary'
        }`}
        title={locked ? '지도 이동 잠금 해제' : '지도 이동 잠금'}
        aria-label={locked ? '지도 이동 잠금 해제' : '지도 이동 잠금'}
      >
        {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </button>

      {/* L-listings-merge6 (2026-04-29 사장님 명령): 주소 라벨 제거. */}
    </div>
  );
}
