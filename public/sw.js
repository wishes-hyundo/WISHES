// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sw.js — v4.0.0 (긴급 킬스위치, 사장님 명령 2026-05-02)
//
// 배경:
//   v3.1.0 (PR #60) 의 PWA 오프라인 캐싱이 _next/static/** 30일 cache-first
//   적용. 코드 변경 (PR #69, #70, #71) 후에도 사용자 브라우저가 캐시된 이전
//   chunk 를 계속 사용 → 변경 안 보임. 하드 리프레시 (Ctrl+Shift+R) 도
//   SW 는 우회 못함.
//
//   사장님 피드백 "여전히 전혀 변경된게 없음" — SW 캐시가 진짜 원인.
//
// 동작:
//   1) install 즉시 skipWaiting → 즉시 activate
//   2) activate 시 모든 cache 삭제 + 자기 자신 unregister
//   3) 다음 페이지 로드부터 SW 없음 → 모든 fetch 가 네트워크 직접
//   4) 새 _next/static/** chunk 정상 수신 → 사장님이 보던 캐시 문제 해결
//
// 후속:
//   PWA 오프라인 캐싱은 향후 필요 시 더 짧은 TTL + revision 기반으로
//   재구현 (예: workbox + precache manifest + skipWaiting+clientsClaim).
//   지금은 사장님 코드 변경 즉시 반영이 우선.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) 모든 캐시 삭제
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      // ignore
    }
    // 2) 모든 클라이언트 제어
    try { await self.clients.claim(); } catch (e) {}
    // 3) 자기 자신 unregister
    try { await self.registration.unregister(); } catch (e) {}
    // 4) 모든 클라이언트에 새로고침 요청
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (e) {}
      }
    } catch (e) {}
  })());
});

// fetch 핸들러 없음 → 모든 요청 네트워크 직접 통과
