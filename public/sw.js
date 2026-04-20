// ============================================================
// sw.js — v2.3.9 긴급 킬 스위치 (self-unregistering)
// 목적: 폰에 꼬여있는 구형 서비스워커를 전부 해제하고, 캐시를 모두 삭제.
//      이후 사이트는 평범한 웹사이트처럼 네트워크에서 직접 서빙됨.
// ============================================================

self.addEventListener('install', (event) => {
  // 즉시 대기 없이 활성화로 넘어감
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1) 모든 캐시 스토리지 삭제
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {
      // 삭제 실패해도 계속 진행
    }

    try {
      // 2) 자신 등록 해제
      await self.registration.unregister();
    } catch (e) {}

    try {
      // 3) 열려있는 모든 클라이언트(탭) 강제 새로고침
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach(client => {
        try { client.navigate(client.url); } catch (e) {}
      });
    } catch (e) {}
  })());
});

// fetch 핸들러 없음 → 브라우저가 네트워크에서 직접 가져옴
