// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapServiceWorker — 지도 전용 SW 조건부 등록 클라이언트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 주의: /public/sw.js 는 과거 구형 SW 를 전부 unregister 하는 킬스위치다.
//   그래서 /sw-map-v1.js 를 별도 경로로 등록하고 scope=/map 으로 제한.
//   기존 킬스위치가 더 이상 필요 없을 때까지는 /map 페이지에서만 활성화.

'use client';

import { useEffect } from 'react';

export default function MapServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // 안전장치: 기존 킬스위치 sw.js 는 건드리지 않고 별도 파일만 등록
    navigator.serviceWorker
      .register('/sw-map-v1.js', { scope: '/' })
      .catch(() => {
        // 등록 실패는 치명적이지 않음 — 지도는 그냥 네트워크로 동작
      });
  }, []);
  return null;
}
