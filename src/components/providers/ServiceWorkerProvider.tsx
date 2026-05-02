// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ServiceWorkerProvider — 비활성화 (사장님 명령 2026-05-02)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// PR #60 에서 prod 캐싱 활성화 → PR #69-71 의 코드 변경 미반영.
// 사장님 피드백 "여전히 전혀 변경된게 없음" 후 SW 비활성화.
//
// 기존 등록된 SW (v3.1.0) 들은 sw.js v4.0.0 (킬 스위치) 가 자기 자신을
// unregister 하므로 사용자 다음 방문 시 자동 정리됨.
//
// 본 컴포넌트는 register 자체를 더 이상 호출하지 않음. 향후 PWA 캐싱 재
// 도입 시 revision 기반 짧은 TTL + 명시적 update 흐름으로 재설계 후 활성화.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect } from 'react';

export default function ServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // 기존 등록된 SW 모두 강제 unregister (v3.1.0 의 캐시 문제 해결)
    // sw.js v4.0.0 자체도 자기를 unregister 하지만, 이중 안전 차원에서 한 번 더.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        try { reg.unregister(); } catch { /* noop */ }
      }
    }).catch(() => { /* noop */ });

    // 모든 캐시 강제 삭제
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const k of keys) {
          try { caches.delete(k); } catch { /* noop */ }
        }
      }).catch(() => { /* noop */ });
    }
  }, []);

  return null;
}
