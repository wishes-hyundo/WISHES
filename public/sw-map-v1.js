// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sw-map-v1.js — /map 전용 경량 Service Worker + Web Push (PR-N-1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ※ 기존 /public/sw.js 는 과거 구형 SW 를 전부 unregister 하는 킬스위치.
//   그래서 본 파일은 별도 이름으로 배포하고, 클라이언트가 명시적으로
//   register('/sw-map-v1.js') 를 호출할 때만 활성화한다.
//
// 전략:
//   - /_next/image, /api/map/clusters, /api/map/items  →  stale-while-revalidate (24h)
//   - dapi.kakao.com 타일                                →  cache-first (7일)
//   - /api/geo/* GeoJSON                                  →  cache-first (30일)
//   - 그 외 요청은 SW 가 건드리지 않고 네트워크 통과 (safe passthrough)
//
// PR-N-1 (2026-04-30): Web Push event handler 추가.
//   사장님 명시: 동의 후만 / 1인당 월 ≤ 4회 / 22~08시 차단 (cron 강제).

// L-naver-2026sw2 (2026-04-26): 캐시 버전 bump.
const CACHE_VERSION = 'v3-2026-04-26-legalunion';
const MAP_CACHE = `wishes-map-${CACHE_VERSION}`;
const TILE_CACHE = `wishes-tiles-${CACHE_VERSION}`;
const IMG_CACHE = `wishes-img-${CACHE_VERSION}`;
const GEO_CACHE = `wishes-geo-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) =>
        k.startsWith('wishes-map-') ||
        k.startsWith('wishes-tiles-') ||
        k.startsWith('wishes-img-') ||
        k.startsWith('wishes-geo-'),
      )
      .filter((k) => !k.endsWith(CACHE_VERSION))
      .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
      .then((net) => {
        if (net && net.ok) cache.put(request, net.clone());
        return net;
      })
      .catch(() => cached);
    return cached || fetchPromise;
  });
}

function cacheFirst(request, cacheName, maxAgeMs) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) {
      const dateHeader = cached.headers.get('sw-cached-at');
      const age = dateHeader ? Date.now() - parseInt(dateHeader, 10) : 0;
      if (age < maxAgeMs) return cached;
    }
    try {
      const net = await fetch(request);
      if (net && net.ok) {
        const cloned = new Response(net.clone().body, {
          status: net.status,
          headers: {
            ...Object.fromEntries(net.headers),
            'sw-cached-at': String(Date.now()),
          },
        });
        cache.put(request, cloned);
      }
      return net;
    } catch {
      return cached || Response.error();
    }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) 지도 타일 (cache-first 7일)
  if (/dapi\.kakao\.com|map[0-9]?\.daumcdn\.net/.test(url.hostname)) {
    event.respondWith(cacheFirst(req, TILE_CACHE, 7 * 24 * 60 * 60 * 1000));
    return;
  }

  // 2) Next/image 프록시 (SWR 24h)
  if (url.pathname.startsWith('/_next/image') || url.pathname.startsWith('/api/images/')) {
    event.respondWith(staleWhileRevalidate(req, IMG_CACHE));
    return;
  }

  // 3) /api/map/* 클러스터·아이템 (SWR)
  if (url.pathname.startsWith('/api/map/')) {
    event.respondWith(staleWhileRevalidate(req, MAP_CACHE));
    return;
  }

  // 4) /api/geo/* GeoJSON (cache-first 30일)
  if (url.pathname.startsWith('/api/geo/')) {
    event.respondWith(cacheFirst(req, GEO_CACHE, 30 * 24 * 60 * 60 * 1000));
    return;
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-N-1 (2026-04-30): Web Push event handler
//   payload schema:
//     { title, body, url?, icon?, badge?, tag? }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'WISHES', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'WISHES';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192x192.png',
    badge: payload.badge || '/favicon-32x32.png',
    tag: payload.tag || 'wishes-default',
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
