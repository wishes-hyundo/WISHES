'use client';

/**
 * SearchClusterLayer — /search 지도 클러스터 마커 (P5 · iOS 26.5 디자인)
 *
 * 배경: KakaoMarkerLayer(/map 용) 를 그대로 쓰니 마커가 과밀하게 겹쳐 "복잡하고
 *   보기 불편" 피드백. /map 의 KakaoMarkerLayer 는 손대지 않고, /search 전용
 *   클린 마커 렌더러를 별도로 둔다.
 *
 * 핵심:
 *   · 겹침 제거 — 픽셀 투영 후 서로 닿기 직전까지만 허용하는 다단계 머지.
 *     화면에 마커가 절대 겹치지 않는다 (직방·호갱노노 2026 패턴).
 *   · iOS 26.5 마감 — 부드러운 다층 그림자, 흰 헤일로 링, 미세 그라데이션.
 *   · 클러스터 클릭 = 줌인. 단일 매물 = 선택 콜백.
 *   · 마커 수가 머지 후 수십 개 수준 → pool 없이 매 갱신 재생성 (freeze 무관).
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

// ── 마커 치수 (iOS 26.5 — 절제된 크기 단계) ──────────────────
function markerDiameter(count: number): number {
  if (count <= 1) return 16;       // 단일 매물 = 점
  if (count < 10) return 30;
  if (count < 50) return 36;
  if (count < 200) return 42;
  if (count < 1000) return 48;
  return 54;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

// ── iOS 26.5 마커 스타일 (주입 1회) ──────────────────────────
const STYLE_ID = 'wishes-search-cluster-style';
const STYLE_CSS = `
.scl-marker{
  display:flex;align-items:center;justify-content:center;
  border-radius:999px;cursor:pointer;color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif;
  font-weight:600;letter-spacing:-0.02em;
  -webkit-tap-highlight-color:transparent;user-select:none;
  background:
    radial-gradient(54% 40% at 33% 23%,rgba(255,255,255,0.92),rgba(255,255,255,0) 64%),
    linear-gradient(168deg,rgba(150,200,166,0.50) 0%,rgba(60,116,80,0.67) 100%);
  -webkit-backdrop-filter:blur(6px) saturate(1.55);
  backdrop-filter:blur(6px) saturate(1.55);
  box-shadow:
    inset 0 1px 1.5px rgba(255,255,255,0.50),
    inset 0 -9px 15px rgba(20,48,30,0.26),
    0 2px 6px rgba(20,48,30,0.10),
    0 9px 22px rgba(20,48,30,0.16);
  text-shadow:0 0.5px 2px rgba(14,38,22,0.46);
  transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s ease-out;
  transform:translateZ(0);
}
.scl-marker:hover{
  transform:scale(1.06) translateZ(0);
  box-shadow:
    inset 0 1px 1.5px rgba(255,255,255,0.58),
    inset 0 -9px 15px rgba(20,48,30,0.26),
    0 3px 9px rgba(20,48,30,0.15),
    0 14px 30px rgba(20,48,30,0.20);
  z-index:300;
}
.scl-marker:active{transform:scale(0.97) translateZ(0);}
.scl-dot{
  width:15px;height:15px;border-radius:999px;cursor:pointer;
  background:
    radial-gradient(62% 50% at 34% 26%,rgba(255,255,255,0.95),rgba(255,255,255,0) 68%),
    linear-gradient(165deg,rgba(150,200,166,0.62),rgba(60,116,80,0.82));
  -webkit-backdrop-filter:blur(4px) saturate(1.5);
  backdrop-filter:blur(4px) saturate(1.5);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.55),
    0 1px 4px rgba(20,48,30,0.22),
    0 4px 11px rgba(20,48,30,0.20);
  transition:transform .16s cubic-bezier(.16,1,.3,1);
  transform:translateZ(0);
}
.scl-dot:hover{transform:scale(1.24) translateZ(0);z-index:300;}
`;

function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

// ── Kakao 타입 (최소) ────────────────────────────────────────
interface KakaoLatLng { /* opaque */ }
interface KakaoProjection { pointFromCoords: (c: unknown) => { x: number; y: number } }
interface KakaoMapsNs {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  CustomOverlay: new (opts: Record<string, unknown>) => {
    setMap: (m: unknown) => void;
  };
}
interface KakaoMapLike {
  getProjection?: () => KakaoProjection;
  getLevel?: () => number;
  setLevel?: (n: number, opts?: Record<string, unknown>) => void;
  panTo?: (latlng: unknown) => void;
}

// ── 겹침 제거 머지 ───────────────────────────────────────────
//   픽셀 투영 후, 두 마커가 닿기 직전(반지름 합)까지만 허용. 다단계 반복으로
//   머지 후 커진 마커가 만드는 2차 겹침까지 해소. 위치는 count 가중 평균.
type MNode = {
  count: number;
  ids: number[];
  lat: number;
  lng: number;
  x: number;
  y: number;
  r: number;
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
      count: c.count,
      ids: c.sample_ids ?? [],
      lat: c.lat,
      lng: c.lng,
    }));
  }

  const radiusOf = (count: number) => markerDiameter(count) / 2 + 2; // +2 = border/여백

  const nodes: MNode[] = clusters.map((c) => {
    // TIER1 단지 좌표가 가까우면 우선 (KakaoMarkerLayer 와 동일 기준)
    const t1Lat = typeof c.tier1_lat === 'number' && Number.isFinite(c.tier1_lat) ? c.tier1_lat : null;
    const t1Lng = typeof c.tier1_lng === 'number' && Number.isFinite(c.tier1_lng) ? c.tier1_lng : null;
    const useT1 = t1Lat != null && t1Lng != null
      && Math.abs(t1Lat - c.lat) < 0.005 && Math.abs(t1Lng - c.lng) < 0.005;
    const lat = useT1 ? t1Lat! : c.lat;
    const lng = useT1 ? t1Lng! : c.lng;
    const p = projection.pointFromCoords(new maps.LatLng(lat, lng) as unknown);
    return {
      count: c.count,
      ids: [...(c.sample_ids ?? [])],
      lat, lng,
      x: p.x, y: p.y,
      r: radiusOf(c.count),
      alive: true,
    };
  });

  // 다단계: 한 패스에서 머지가 일어나면 다시 (최대 8패스)
  for (let pass = 0; pass < 8; pass++) {
    let merged = false;
    for (let i = 0; i < nodes.length; i++) {
      if (!nodes[i].alive) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        if (!nodes[j].alive) continue;
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 닿기 직전(반지름 합의 0.98배)까지만 허용 — 그 안쪽이면 머지
        if (dist < (a.r + b.r) * 0.98) {
          const big = a.count >= b.count ? a : b;
          const small = a.count >= b.count ? b : a;
          const total = big.count + small.count;
          // count 가중 평균 위치
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

  return nodes
    .filter((n) => n.alive)
    .map((n) => ({ count: n.count, ids: n.ids, lat: n.lat, lng: n.lng }));
}

export function SearchClusterLayer({ map, clusters, onSelectListing }: SearchClusterLayerProps) {
  const overlaysRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  const cbRef = useRef(onSelectListing);
  cbRef.current = onSelectListing;

  useEffect(() => { injectStyle(); }, []);

  // 마커 렌더 — clusters/map 변경 시 전량 재생성 (머지 후 수십 개라 비용 무시 가능)
  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    // 이전 오버레이 제거
    for (const ov of overlaysRef.current) {
      try { ov.setMap(null); } catch { /* noop */ }
    }
    overlaysRef.current = [];

    const merged = mergeClusters(clusters, maps, map as KakaoMapLike);

    for (const m of merged) {
      const el = document.createElement('div');
      const single = m.count <= 1;
      if (single) {
        el.className = 'scl-dot';
        el.dataset.singleId = String(m.ids[0] ?? '');
      } else {
        el.className = 'scl-marker';
        const d = markerDiameter(m.count);
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
        el.style.fontSize = `${m.count >= 1000 ? 12 : m.count >= 100 ? 12 : 11.5}px`;
        el.textContent = formatCount(m.count);
        el.dataset.clusterLat = String(m.lat);
        el.dataset.clusterLng = String(m.lng);
      }

      const ov = new maps.CustomOverlay({
        position: new maps.LatLng(m.lat, m.lng),
        content: el,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: single ? 90 : 100,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }
  }, [clusters, map]);

  // 클릭 처리 — 단일=선택, 클러스터=줌인
  useEffect(() => {
    if (!map) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const dot = target.closest('.scl-dot') as HTMLElement | null;
      if (dot) {
        e.stopPropagation();
        const id = parseInt(dot.dataset.singleId || '', 10);
        if (!isNaN(id)) cbRef.current?.(id);
        return;
      }
      const cl = target.closest('.scl-marker') as HTMLElement | null;
      if (cl) {
        e.stopPropagation();
        const lat = parseFloat(cl.dataset.clusterLat || '');
        const lng = parseFloat(cl.dataset.clusterLng || '');
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
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [map]);

  // 언마운트 정리
  useEffect(() => {
    return () => {
      for (const ov of overlaysRef.current) {
        try { ov.setMap(null); } catch { /* noop */ }
      }
      overlaysRef.current = [];
    };
  }, []);

  return null;
}

export default SearchClusterLayer;
