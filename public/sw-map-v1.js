// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sw-map-v1.js — /map 전용 경량 Service Worker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ※ 기존 /public/sw.js 는 과거 구형 SW 를 전부 unregister 하는 킬스위치.
//   그래서 본 파일은 별도 이름으로 배포하고, 클라이언트가 명시적으로
//   register('/sw-map-v1.js') 를 호출할 때만 활성화한다.
//
// 전략:
//   - /_next/image, /api/map/clusters, /api/map/items  →  stale-while-revalidate (24h)
//   - dapi.kakao.com 타일                                →  cache-first (7일)
//   - 그 외 요청은 SW 가 건드리지 않고 네트워크 통과 (safe passthrough)

const CACHE_VERSION = 'v1-2026-04-20';
const MAP_CACHE = `wishes-map-${CACHE_VERSION}`;
const TILE_CACHE = `wishes-tiles-${CACHE_VERSION}`;
const IMG_CACHE = `wishes-img-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 구버전 캐시 정리
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) =>
        k.startsWith('wishes-map-') ||
        k.startsWith('wishes-tiles-') ||
        k.startsWith('wishes-img-'),
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
      // 오래된 캐시면 백그라운드 갱신
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

  // 그 외 — 건드리지 않음 (네트워크 통과)
});
