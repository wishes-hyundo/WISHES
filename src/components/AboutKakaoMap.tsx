'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    kakao: any;
  }
}

const OFFICE_LAT = 37.4847;
const OFFICE_LNG = 126.9293;

export default function AboutKakaoMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const initMap = () => {
      const { kakao } = window;
      if (!kakao?.maps) return;

      kakao.maps.load(() => {
        const container = mapRef.current;
        if (!container) return;

        const options = {
          center: new kakao.maps.LatLng(OFFICE_LAT, OFFICE_LNG),
          level: 3,
        };

        const map = new kakao.maps.Map(container, options);

        // 마커 생성
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(OFFICE_LAT, OFFICE_LNG),
          map,
        });

        // 인포위도우
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:8px 12px;font-size:13px;font-weight:600;white-space:nowrap;">WISHES</div>`,
        });
        infowindow.open(map, marker);

        // 줌 컨트롤
        const zoomControl = new kakao.maps.ZoomControl();
        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
      });
    };

    // SDK가 이미 로드된 경우
    if (window.kakao?.maps) {
      initMap();
    } else {
      // SDK 로드 대기
      const interval = setInterval(() => {
        if (window.kakao?.maps) {
          clearInterval(interval);
          initMap();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-lg"
      style={{ minHeight: '280px' }}
    />
  );
}
