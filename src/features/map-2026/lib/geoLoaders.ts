// L-naver-2026split2 (2026-04-26): GeoJSON loaders + loading inflight tracking 추출.
// 순수 fetch 로직만 — pointInPolygon/bbox 같은 logic 은 geoUtils.ts.
// AdminRegionOverlay 의 700+ 줄 중 80 줄 분리.

import type { GeoCollection, GeoFeature } from './geoUtils';

const SIDO_GEOJSON_URL    = '/api/geo/sido';
const SIGUNGU_GEOJSON_URL = '/api/geo/sigungu';
const DONG_GEOJSON_URL    = '/api/geo/dong';

let sidoCache: GeoCollection | null = null;
let sigunguCache: GeoCollection | null = null;
let dongCache: GeoCollection | null = null;
let pendingSido: Promise<GeoCollection | null> | null = null;
let pendingSigungu: Promise<GeoCollection | null> | null = null;
let pendingDong: Promise<GeoCollection | null> | null = null;

let loadInFlight = 0;
const loadingListeners = new Set<(loading: boolean) => void>();

function setLoadInFlight(delta: number) {
  loadInFlight += delta;
  const isLoading = loadInFlight > 0;
  loadingListeners.forEach((l) => l(isLoading));
}

export function subscribeLoading(cb: (loading: boolean) => void): () => void {
  loadingListeners.add(cb);
  return () => loadingListeners.delete(cb);
}

export async function loadSido(): Promise<GeoCollection | null> {
  if (sidoCache) return sidoCache;
  if (pendingSido) return pendingSido;
  setLoadInFlight(1);
  pendingSido = fetch(SIDO_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sidoCache = j as GeoCollection | null; return sidoCache; })
    .catch(() => null)
    .finally(() => { pendingSido = null; setLoadInFlight(-1); });
  return pendingSido;
}

export async function loadSigungu(): Promise<GeoCollection | null> {
  if (sigunguCache) return sigunguCache;
  if (pendingSigungu) return pendingSigungu;
  setLoadInFlight(1);
  pendingSigungu = fetch(SIGUNGU_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sigunguCache = j as GeoCollection | null; return sigunguCache; })
    .catch(() => null)
    .finally(() => { pendingSigungu = null; setLoadInFlight(-1); });
  return pendingSigungu;
}

// L-naver-2026worker2: dong GeoJSON 은 Web Worker 에서 파싱.  ~34MB JSON.parse +
//   1000+ feature bbox 가 메인 스레드 막던 문제 해결.
export async function loadDong(): Promise<GeoCollection | null> {
  if (dongCache) return dongCache;
  if (pendingDong) return pendingDong;
  setLoadInFlight(1);
  pendingDong = (async () => {
    try {
      const res = await fetch(DONG_GEOJSON_URL);
      if (!res.ok) return null;
      const json = await res.json();
      if (typeof Worker !== 'undefined') {
        try {
          const w = new Worker(new URL('../workers/geojsonProcessor.ts', import.meta.url), { type: 'module' });
          const out = await new Promise<{ features: GeoFeature[] } | null>((resolve) => {
            const timeout = setTimeout(() => { resolve(null); w.terminate(); }, 15000);
            w.onmessage = (e: MessageEvent<{ features: GeoFeature[] }>) => {
              clearTimeout(timeout);
              resolve(e.data);
              w.terminate();
            };
            w.onerror = () => { clearTimeout(timeout); resolve(null); w.terminate(); };
            w.postMessage({ type: 'process', json });
          });
          if (out?.features) {
            dongCache = { type: 'FeatureCollection', features: out.features };
            return dongCache;
          }
        } catch { /*noop*/ }
      }
      dongCache = json as GeoCollection;
      return dongCache;
    } catch {
      return null;
    } finally {
      pendingDong = null;
      setLoadInFlight(-1);
    }
  })();
  return pendingDong;
}

// L-naver-2026chunk1: 시군구별 dong chunk lazy-loading.  33MB → 50KB/시군구.
const dongChunkCache = new Map<string, GeoCollection>();
const pendingChunks = new Map<string, Promise<GeoCollection | null>>();

export async function loadDongChunk(sigCode: string): Promise<GeoCollection | null> {
  if (!/^\d{5}$/.test(sigCode)) return null;
  const cached = dongChunkCache.get(sigCode);
  if (cached) return cached;
  const pending = pendingChunks.get(sigCode);
  if (pending) return pending;
  setLoadInFlight(1);
  const promise = (async () => {
    try {
      const r = await fetch(`/api/geo/dong/sigungu/${sigCode}`);
      if (!r.ok) return null;
      const j = (await r.json()) as GeoCollection;
      dongChunkCache.set(sigCode, j);
      return j;
    } catch {
      return null;
    } finally {
      pendingChunks.delete(sigCode);
      setLoadInFlight(-1);
    }
  })();
  pendingChunks.set(sigCode, promise);
  return promise;
}
