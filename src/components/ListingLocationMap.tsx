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
}

/**
 * 매물 소재지 위치를 반영하는 카카오 지도.
 * - 기본값: 락(자물쇠) 상태 → 드래그/확대축소/휠 모두 비활성화, 고정 상태.
 * - 락을 풀면 드래그, 휠 줌, 더블클릭 줌, 확대축소 컨트롤이 모두 활성화.
 */
export default function ListingLocationMap({ lat, lng, address, title }: Props) {
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

        // 마커
        const marker = new kakao.maps.Marker({ position: center, map });

        // 인포윈도우 (마스킹된 주소 우선 — title에 주소가 섞인 크롤링 매물 누수 방지)
        const label = (address || title || '매물 위치').toString().slice(0, 40);
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;color:#0f172a;">${label}</div>`,
        });
        infowindow.open(map, marker);

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
      <div className="flex items-center gap-2 text-xs text-gray-400 p-4">
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

      {/* 주소 라벨 (동 단위만) */}
      {address && (
        <div className="absolute bottom-3 left-3 right-3 z-10 bg-white/95 backdrop-blur px-3 py-2 rounded-lg shadow-md border border-gray-100">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium truncate">
            <MapPin className="w-3 h-3 text-wishes-primary shrink-0" />
            {address}
          </div>
        </div>
      )}
    </div>
  );
}
