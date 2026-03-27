'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    kakao: any;
  }
}

const OFFICE_LAT = 37.4852227;
const OFFICE_LNG = 126.9310212;

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

        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(OFFICE_LAT, OFFICE_LNG),
          map,
        });

        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:8px 12px;font-size:13px;font-weight:600;white-space:nowrap;">WISHES</div>`,
        });
        infowindow.open(map, marker);

        const zoomControl = new kakao.maps.ZoomControl();
        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
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
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-lg"
      style={{ minHeight: '280px' }}
    />
  );
}
