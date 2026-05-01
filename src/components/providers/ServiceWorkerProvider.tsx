// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ServiceWorkerProvider — 전역 SW 등록 (PR-F1, 2026-05-02)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// /public/sw.js v3.1.0 부터는 push handler + PWA 오프라인 캐싱을 모두 제공.
// 사용자 push opt-in 여부와 무관하게 전역 등록하여 PWA 캐싱 혜택 부여.
//
// 안전장치:
//   - production 환경에서만 등록 (dev/preview 빌드는 SW 캐시로 인한 디버깅 혼란 회피)
//   - 'serviceWorker' 미지원 브라우저는 silent skip
//   - register 실패는 사용자 영향 0 (네트워크 통과 모드로 동작)
//
// ※ pushClient.ts 가 동일 sw.js 를 push opt-in 시 register 하는데,
//    동일 URL register 는 idempotent (이미 등록된 경우 기존 registration 반환).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect } from 'react';

export default function ServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // production 환경에서만 활성 (dev 빌드는 캐싱 시 디버깅 혼란)
    if (process.env.NODE_ENV !== 'production') return;

    // 페이지 idle 까지 대기 (LCP/INP 영향 최소화)
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // 등록 실패 = 사용자 영향 0 (네트워크 통과)
        });
    };

    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void })
        .requestIdleCallback(register);
    } else {
      // requestIdleCallback 미지원 (Safari 등) → load 후 1초
      setTimeout(register, 1000);
    }
  }, []);

  return null;
}
