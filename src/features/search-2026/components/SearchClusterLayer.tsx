'use client';

/**
 * SearchClusterLayer — /search 지도 마커 (P5 / SW-7)
 *
 * 대표님 확정 (2026-05-21): 마커는 대표님이 보내주신 글라스 그린 이미지를
 *   그대로 사용. 형태·색·재질 손대지 않고 회색 배경만 떼어 PNG 로 마스킹.
 *
 *   · 개별 매물(1개) — 글라스 핀 (logo1779371164). 최대 확대 단계.
 *   · 클러스터(2개+) — 핀 머리(bulb)를 원형으로 도려낸 글라스 동그라미 + 개수.
 *   · 동그라미 = 핀과 완전히 같은 색·재질 (같은 이미지에서 추출).
 *   · 핀 tip 이 좌표에 앵커. 동그라미는 중심 앵커.
 *   · /map 은 KakaoMarkerLayer 가 담당 — 여기서 손대지 않음.
 */

import { useEffect, useRef } from 'react';

export interface SearchCluster {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  sample_ids?: number[] | null;
  tier1_lat?: number | null;
  tier1_lng?: number | null;
}

export interface SearchClusterLayerProps {
  map: unknown;
  clusters: SearchCluster[];
  onSelectListing?: (id: number) => void;
}

// 마커 에셋 (public/)
const PIN_IMG = '/search-marker-pin.png';
const CIRCLE_IMG = '/search-marker-circle.png';
// 핀 PNG 240x308 — tip 앵커 (회색 배경 제거 후 측정값)
const PIN_RATIO = 308 / 240;
const PIN_XANCHOR = 0.502;
const PIN_TIP_YANCHOR = 0.9805;

function pinWidth(count: number): number {
  if (count <= 1) return 30;  // SW-7: 최대확대 핀 — 크기 축소
  if (count < 10) return 44;
  if (count < 50) return 50;
  if (count < 200) return 56;
  if (count < 1000) return 62;
  return 70;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

const STYLE_ID = 'wishes-search-pin-style';
const STYLE_CSS = `
.scl-pin{
  position:relative;cursor:pointer;
  transition:transform .18s cubic-bezier(.16,1,.3,1);
}
.scl-pin img{display:block;width:100%;height:100%;opacity:.78;}
.scl-pinimg{transform-origin:50% 98%;}
.scl-pinimg img{filter:drop-shadow(0 2px 3px rgba(12,40,24,.34));}
.scl-pinimg:hover{transform:scale(1.10);z-index:400;}
.scl-pinimg:active{transform:scale(0.96);}
.scl-circle{transform-origin:50% 50%;}
.scl-circle img{filter:drop-shadow(0 2px 4px rgba(12,40,24,.30));}
.scl-circle:hover{transform:scale(1.08);z-index:400;}
.scl-circle:active{transform:scale(0.96);}
.scl-count{
  position:absolute;inset:0;
  display:flex;align-items:center;justify-content:center;
  color:#ffffff;font-weight:700;letter-spacing:-.5px;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Rounded','Pretendard',sans-serif;
  text-shadow:0 1px 2px rgba(12,40,24,.55),0 0 3px rgba(12,40,24,.40);
  user-select:none;pointer-events:none;
}
`;

function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

interface KakaoLatLng { /* opaque */ }
interface KakaoProjection { pointFromCoords: (c: unknown) => { x: number; y: number } }
interface KakaoMapsNs {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  CustomOverlay: new (opts: Record<string, unknown>) => {
    setMap: (m: unknown) => void;
    setPosition: (p: unknown) => void;
  };
}
interface KakaoMapLike {
  getProjection?: () => KakaoProjection;
  getLevel?: () => number;
  setLevel?: (n: number, opts?: Record<string, unknown>) => void;
  panTo?: (latlng: unknown) => void;
}

type MNode = {
  count: number; ids: number[];
  lat: number; lng: number;
  x: number; y: number; r: number;
  alive: boolean;
};

function mergeClusters(
  clusters: SearchCluster[],
  maps: KakaoMapsNs,
  map: KakaoMapLike,
): Array<{ count: number; ids: number[]; lat: number; lng: number }> {
  const projection = map.getProjection?.();
  if (!projection || clusters.length === 0) {
    return clusters.map((c) => ({
      count: c.count, ids: c.sample_ids ?? [], lat: c.lat, lng: c.lng,
    }));
  }
  const radiusOf = (count: number) => pinWidth(count) * 0.5 + 2;

  const nodes: MNode[] = clusters.map((c) => {
    const t1Lat = typeof c.tier1_lat === 'number' && Number.isFinite(c.tier1_lat) ? c.tier1_lat : null;
    const t1Lng = typeof c.tier1_lng === 'number' && Number.isFinite(c.tier1_lng) ? c.tier1_lng : null;
    const useT1 = t1Lat != null && t1Lng != null
      && Math.abs(t1Lat - c.lat) < 0.005 && Math.abs(t1Lng - c.lng) < 0.005;
    const lat = useT1 ? t1Lat! : c.lat;
    const lng = useT1 ? t1Lng! : c.lng;
    const p = projection.pointFromCoords(new maps.LatLng(lat, lng) as unknown);
    return {
      count: c.count, ids: [...(c.sample_ids ?? [])],
      lat, lng, x: p.x, y: p.y, r: radiusOf(c.count), alive: true,
    };
  });

  for (let pass = 0; pass < 8; pass++) {
    let merged = false;
    for (let i = 0; i < nodes.length; i++) {
      if (!nodes[i].alive) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        if (!nodes[j].alive) continue;
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (a.r + b.r) * 0.98) {
          const big = a.count >= b.count ? a : b;
          const small = a.count >= b.count ? b : a;
          const total = big.count + small.count;
          big.lat = (big.lat * big.count + small.lat * small.count) / total;
          big.lng = (big.lng * big.count + small.lng * small.count) / total;
          big.x = (big.x * big.count + small.x * small.count) / total;
          big.y = (big.y * big.count + small.y * small.count) / total;
          big.count = total;
          big.ids = [...big.ids, ...small.ids];
          big.r = radiusOf(total);
          small.alive = false;
          merged = true;
        }
      }
    }
    if (!merged) break;
  }

  return nodes.filter((n) => n.alive)
    .map((n) => ({ count: n.count, ids: n.ids, lat: n.lat, lng: n.lng }));
}

export function SearchClusterLayer({ map, clusters, onSelectListing }: SearchClusterLayerProps) {
  // MA-1: 오버레이 키풀 — clusters 갱신 시 전체 teardown 대신 재사용 → 깜빡임 제거.
  type PoolEntry = { ov: { setMap: (m: unknown) => void; setPosition: (p: unknown) => void }; el: HTMLDivElement };
  const overlaysRef = useRef<Map<string, PoolEntry>>(new Map());
  const cbRef = useRef(onSelectListing);
  cbRef.current = onSelectListing;

  useEffect(() => { injectStyle(); }, []);

  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    const merged = mergeClusters(clusters, maps, map as KakaoMapLike);
    const pool = overlaysRef.current;
    const seen = new Set<string>();

    for (const m of merged) {
      const single = m.count <= 1;
      // 좌표+종류 기반 키 — 같은 자리 같은 종류면 재사용. 동좌표 중복은 #n 으로 분리.
      const baseKey = `${m.lat.toFixed(5)}_${m.lng.toFixed(5)}_${single ? 's' : 'c'}`;
      let key = baseKey; let dup = 1;
      while (seen.has(key)) key = `${baseKey}#${dup++}`;
      seen.add(key);

      const w = single ? pinWidth(1) : pinWidth(m.count);
      const entry = pool.get(key);
      const el = entry ? entry.el : document.createElement('div');

      if (single) {
        el.className = 'scl-pin scl-pinimg';
        el.style.width = `${w}px`;
        el.style.height = `${Math.round(w * PIN_RATIO)}px`;
        el.innerHTML = `<img src="${PIN_IMG}" alt="" draggable="false"/>`;
        el.dataset.singleId = String(m.ids[0] ?? '');
        delete el.dataset.clusterLat; delete el.dataset.clusterLng;
      } else {
        const label = formatCount(m.count);
        const fs = label.length >= 4
          ? Math.round(w * 0.27)
          : label.length === 3 ? Math.round(w * 0.34) : Math.round(w * 0.42);
        el.className = 'scl-pin scl-circle';
        el.style.width = `${w}px`;
        el.style.height = `${w}px`;
        el.innerHTML =
          `<img src="${CIRCLE_IMG}" alt="" draggable="false"/>` +
          `<span class="scl-count" style="font-size:${fs}px">${label}</span>`;
        el.dataset.clusterLat = String(m.lat);
        el.dataset.clusterLng = String(m.lng);
        delete el.dataset.singleId;
      }

      if (entry) {
        try { entry.ov.setPosition(new maps.LatLng(m.lat, m.lng)); } catch { /* noop */ }
      } else {
        const ov = new maps.CustomOverlay({
          position: new maps.LatLng(m.lat, m.lng),
          content: el,
          xAnchor: single ? PIN_XANCHOR : 0.5,
          yAnchor: single ? PIN_TIP_YANCHOR : 0.5,
          zIndex: single ? 90 : 100,
        });
        ov.setMap(map);
        pool.set(key, { ov, el });
      }
    }
    // 이번 렌더에 없는 오버레이만 제거
    for (const [k, e] of pool) {
      if (!seen.has(k)) {
        try { e.ov.setMap(null); } catch { /* noop */ }
        pool.delete(k);
      }
    }
  }, [clusters, map]);

  useEffect(() => {
    if (!map) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const pin = (target.closest && target.closest('.scl-pin')) as HTMLElement | null;
      if (!pin) return;
      e.stopPropagation();
      if (pin.dataset.singleId) {
        const id = parseInt(pin.dataset.singleId, 10);
        if (!isNaN(id)) cbRef.current?.(id);
        return;
      }
      const lat = parseFloat(pin.dataset.clusterLat || '');
      const lng = parseFloat(pin.dataset.clusterLng || '');
      if (!isNaN(lat) && !isNaN(lng)) {
        const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
        const maps = win.kakao?.maps;
        const m = map as KakaoMapLike;
        if (maps && m.setLevel && m.getLevel) {
          const ll = new maps.LatLng(lat, lng);
          const next = Math.max(1, m.getLevel() - 2);
          try { m.setLevel(next, { anchor: ll, animate: true }); }
          catch { try { m.setLevel(next); } catch { /* noop */ } }
          try { m.panTo?.(ll); } catch { /* noop */ }
        }
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [map]);

  useEffect(() => {
    const pool = overlaysRef.current;
    return () => {
      for (const e of pool.values()) {
        try { e.ov.setMap(null); } catch { /* noop */ }
      }
      pool.clear();
    };
  }, []);

  return null;
}

export default SearchClusterLayer;
