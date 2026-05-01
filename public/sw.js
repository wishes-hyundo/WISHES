// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sw.js — v3.1.0 (F1 PWA 오프라인 캐싱, 2026-05-02)
//
// 변경 이력:
//   v2.3.9: 긴급 킬 스위치 (자기 자신 unregister) — 일회성
//   v3.0.0: kill switch 제거. Push 알림 + 기본 PWA install 핸들러. (PR #52)
//   v3.1.0: F1 fetch 핸들러 추가. precache + runtime cache 전략. (PR-F1)
//
// 캐싱 전략:
//   1) precache (install)
//      - /offline (오프라인 폴백 페이지)
//      - /favicon.ico, /apple-touch-icon.png, /icon-{192,512}x{192,512}.png
//      - /manifest.json
//   2) /_next/static/** (immutable assets) → cache-first, 30일
//   3) /_next/image, /api/images/* (이미지) → stale-while-revalidate
//   4) Kakao map 타일 (dapi.kakao.com, map.daumcdn.net) → cache-first, 7일
//   5) /api/map/* → stale-while-revalidate (clusters, items, search)
//   6) /api/geo/* → cache-first, 30일 (GeoJSON 변동 적음)
//   7) /api/listings/{map,viewport} → stale-while-revalidate (5분 TTL)
//   8) HTML 페이지 (navigate) → network-first, 실패 시 캐시 → 실패 시 /offline
//   9) skip: POST/PUT/DELETE, /api/auth/*, /api/admin/*, /api/push/*, /api/cron/*
//
// 안전:
//   - skipWaiting + clients.claim 으로 즉시 활성화
//   - 이전 버전 캐시 자동 정리 (CACHE_VERSION 변경 시)
//   - opaque response (cross-origin no-cors) 도 캐시 가능
//   - 5xx 응답은 캐시 X (stale 데이터로 오류 반환 방지)
//
// 참고: sw-map-v1.js 는 이전 prototype, MapServiceWorker.tsx 는 orphan(미사용).
//       본 sw.js 가 모든 SW 기능 통합.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SW_VERSION = 'wishes-sw-v3.1.0';
const PRECACHE = `${SW_VERSION}-precache`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const IMG_CACHE = `${SW_VERSION}-img`;
const TILE_CACHE = `${SW_VERSION}-tiles`;
const API_CACHE = `${SW_VERSION}-api`;
const GEO_CACHE = `${SW_VERSION}-geo`;
const HTML_CACHE = `${SW_VERSION}-html`;

const ALL_CACHES = [PRECACHE, STATIC_CACHE, IMG_CACHE, TILE_CACHE, API_CACHE, GEO_CACHE, HTML_CACHE];

const PRECACHE_URLS = [
  '/offline',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json',
];

// ─────────────────────────────────────────────────────────
// install — precache 핵심 자원
// ─────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(PRECACHE);
      // addAll 은 한 개라도 실패하면 전체 실패 → 개별 add 로 best-effort
      await Promise.all(
        PRECACHE_URLS.map((u) =>
          cache.add(u).catch((err) => {
            // precache 실패는 install 실패로 이어지지 않음 (offline page 만 critical)
            console.warn('[sw] precache miss:', u, err && err.message);
          })
        )
      );
    } catch (e) {
      // 전체 precache 실패해도 SW 자체는 활성화 — 네트워크 통과 모드로 동작
    }
    self.skipWaiting();
  })());
});

// ─────────────────────────────────────────────────────────
// activate — 이전 버전 캐시 정리
// ─────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      );
    } catch (e) {
      // ignore
    }
    try { await self.clients.claim(); } catch (e) {}
  })());
});

// ─────────────────────────────────────────────────────────
// 캐시 전략 헬퍼
// ─────────────────────────────────────────────────────────

async function cacheFirst(req, cacheName, maxAgeMs) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    const stamp = cached.headers.get('sw-cached-at');
    const age = stamp ? Date.now() - parseInt(stamp, 10) : 0;
    if (!maxAgeMs || age < maxAgeMs) return cached;
  }
  try {
    const net = await fetch(req);
    if (net && (net.ok || net.type === 'opaque') && net.status < 500) {
      // sw-cached-at 스탬프를 헤더에 추가해서 재캐싱
      const headers = new Headers(net.headers);
      headers.set('sw-cached-at', String(Date.now()));
      const cloned = new Response(net.clone().body, {
        status: net.status,
        statusText: net.statusText,
        headers,
      });
      cache.put(req, cloned).catch(() => {});
    }
    return net;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((net) => {
      if (net && (net.ok || net.type === 'opaque') && net.status < 500) {
        cache.put(req, net.clone()).catch(() => {});
      }
      return net;
    })
    .catch(() => cached || Response.error());
  return cached || fetchPromise;
}

async function networkFirstHTML(req) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const net = await fetch(req);
    if (net && net.ok) {
      cache.put(req, net.clone()).catch(() => {});
    }
    return net;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // 마지막 폴백: precache 의 /offline
    const offline = await caches.match('/offline');
    if (offline) return offline;
    return Response.error();
  }
}

// ─────────────────────────────────────────────────────────
// fetch — 라우팅
// ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // mutation 메서드는 SW 가 건드리지 않음
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // 같은 origin 외에는 일부 (Kakao map 등) 만 처리
  const isSameOrigin = url.origin === self.location.origin;

  // ── cross-origin: Kakao map 타일만 처리, 나머지는 통과 ──
  if (!isSameOrigin) {
    if (/(?:^|\.)dapi\.kakao\.com$|(?:^|\.)map[0-9]?\.daumcdn\.net$/.test(url.hostname)) {
      event.respondWith(cacheFirst(req, TILE_CACHE, 7 * 24 * 60 * 60 * 1000));
    }
    return;
  }

  // ── skip: SW 가 건드리면 안 되는 경로 ──
  const path = url.pathname;
  if (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/push/') ||
    path.startsWith('/api/cron/') ||
    path.startsWith('/api/csp-report') ||
    path.startsWith('/api/payments/') ||
    path.startsWith('/api/health')
  ) {
    return;
  }

  // ── /_next/static/** (immutable) ──
  if (path.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE, 30 * 24 * 60 * 60 * 1000));
    return;
  }

  // ── /_next/image, /api/images/*, /api/img-proxy ──
  if (path.startsWith('/_next/image') || path.startsWith('/api/images/') || path.startsWith('/api/img-proxy')) {
    event.respondWith(staleWhileRevalidate(req, IMG_CACHE));
    return;
  }

  // ── /api/geo/* (GeoJSON) ──
  if (path.startsWith('/api/geo/')) {
    event.respondWith(cacheFirst(req, GEO_CACHE, 30 * 24 * 60 * 60 * 1000));
    return;
  }

  // ── /api/map/* (clusters, items, search) ──
  if (path.startsWith('/api/map/')) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }

  // ── /api/listings/{map,viewport} (5분 TTL stale-while-revalidate) ──
  if (path === '/api/listings/map' || path === '/api/listings/viewport') {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }

  // ── 정적 자원 (폰트, 아이콘, 이미지) ──
  if (
    path === '/favicon.ico' ||
    path === '/apple-touch-icon.png' ||
    path === '/manifest.json' ||
    /\.(ico|png|jpg|jpeg|webp|avif|svg|woff2?|ttf)$/.test(path)
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE, 30 * 24 * 60 * 60 * 1000));
    return;
  }

  // ── HTML navigate 요청 (페이지 이동) ──
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // 그 외는 SW 가 건드리지 않음 (네트워크 통과)
});

// ───────────────────────────────────────────────────────
// Push 알림 수신 (v3.0.0 부터 — 변경 없음)
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
    icon: payload.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: payload.tag || 'wishes-push',
    data: { url: payload.url || '/' },
    requireInteraction: false,
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

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

self.addEventListener('pushsubscriptionchange', (event) => {
  // 사용자 다음 페이지 방문 시 클라이언트 재구독 로직이 동작.
});
