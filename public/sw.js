// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sw.js — v3.0.0 (A3, 2026-05-02)
//
// 변경 이력:
//   v2.3.9: 긴급 킬 스위치 (자기 자신 unregister) — 구형 sw 정리용 일회성
//   v3.0.0: kill switch 제거. Push 알림 + 기본 PWA install 핸들러.
//
// 주의:
//   - fetch 핸들러 미구현 — 기본 네트워크 동작 유지 (오프라인 캐싱 X, F1 차후)
//   - 이전 v2.3.9 가 unregister 시키므로 사용자 첫 방문 후 새로 등록됨
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SW_VERSION = 'wishes-sw-v3.0.0';

self.addEventListener('install', (event) => {
  // 설치 즉시 활성화 (이전 sw 대체)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 이전 버전 캐시 정리
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))
      );
    } catch (e) {
      // 캐시 정리 실패해도 계속 진행
    }
    // 즉시 모든 클라이언트 제어
    try { await self.clients.claim(); } catch (e) {}
  })());
});

// fetch 핸들러 없음 → 브라우저가 네트워크에서 직접 가져옴 (PWA 오프라인은 차후)

// ───────────────────────────────────────────────────────
// Push 알림 수신
// ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: '위시스 알림', body: event.data.text() };
  }
  const title = payload.title || '위시스';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: payload.tag || 'wishes-push',
    data: { url: payload.url || '/' },
    requireInteraction: false,
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 해당 URL 열기 (이미 열린 탭 있으면 focus)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url && client.url.endsWith(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    } catch (e) {
      // ignore
    }
  })());
});

// 구독 만료 알림 (브라우저가 endpoint 갱신 요청)
self.addEventListener('pushsubscriptionchange', (event) => {
  // 단순 처리: 다음 사용자 페이지 방문 시 클라이언트 재구독 로직이 동작.
  // 더 robust 한 처리는 차후 (재구독 후 /api/push/subscribe 자동 갱신).
});
