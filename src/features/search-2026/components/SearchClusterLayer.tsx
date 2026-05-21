'use client';

/**
 * SearchClusterLayer — /search 지도 마커 (P5 · 애플지도 풍선 핀)
 *
 * 대표님 확정: 단일 정체성 = 애플지도 둥근 풍선 핀. 클러스터도 핀.
 *   · 클러스터(2개 이상) — 풍선 핀, head 안에 개수 숫자. head 크기 = 개수 비례.
 *   · 개별 매물(1개)      — 풍선 핀, head 안에 흰 점.
 *   · 줌 적응 — 서버 클러스터 단위(시→구→동→건물)가 줌마다 바뀌고,
 *     머지 후 핀이 재배치·재크기. 개수는 클러스터 핀에 항상 표시.
 *
 * 설계:
 *   · head = 원(글로스·그림자 정상), tail = 아래 삼각형. 회전 안 씀 → 그림자/광택 정상.
 *   · 핀 tip(삼각형 꼭짓점)이 좌표에 앵커 (yAnchor 1.0).
 *   · 겹침 제거 머지 — head 반지름 기준, 닿기 직전까지만.
 *   · /map 의 KakaoMarkerLayer 는 손대지 않음.
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

// ── head(원) 지름 — 개수 비례 단계 ───────────────────────────
function headDiameter(count: number): number {
  if (count <= 1) return 32;
  if (count < 10) return 38;
  if (count < 50) return 44;
  if (count < 200) return 50;
  if (count < 1000) return 56;
  return 62;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

// 핀 기하 — head 지름에서 tail·컨테이너 치수 산출
function pinGeometry(headD: number) {
  const tailHalf = Math.round(headD * 0.21);   // 삼각형 밑변 절반
  const tailH = Math.round(headD * 0.44);      // 삼각형 높이
  const overlap = Math.round(headD * 0.30);    // head 안으로 파묻히는 양
  const tailTop = headD - overlap;
  const containerH = tailTop + tailH;
  return { tailHalf, tailH, tailTop, containerH };
}

// ── 애플 풍선 핀 스타일 (주입 1회) ───────────────────────────
const STYLE_ID = 'wishes-search-pin-style';
const STYLE_CSS = `
.scl-pin{
  position:relative;cursor:pointer;
  transform-origin:50% 100%;
  transition:transform .18s cubic-bezier(.16,1,.3,1);
}
.scl-pin:hover{transform:scale(1.07);z-index:400;}
.scl-pin:active{transform:scale(0.96);}
.scl-tail{
  position:absolute;left:50%;width:0;height:0;
  transform:translateX(-50%);
  border-style:solid;
  border-color:#2f7a47 transparent transparent transparent;
  z-index:1;
}
.scl-head{
  position:absolute;left:0;top:0;z-index:2;
  border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 38% 30%,#5cab70,#2f7a47 78%);
  box-shadow:
    inset 0 1.5px 1.5px rgba(255,255,255,0.42),
    inset 0 -6px 10px rgba(16,44,26,0.26),
    0 4px 11px rgba(16,44,26,0.32),
    0 1px 3px rgba(16,44,26,0.22);
}
.scl-num{
  color:#fff;font-weight:600;letter-spacing:-0.02em;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif;
  text-shadow:0 0.5px 2px rgba(12,34,18,0.5);
  pointer-events:none;
}
.scl-dot{
  border-radius:50%;
  background:radial-gradient(circle at 38% 32%,#ffffff,#dde8e0);
  box-shadow:inset 0 -1px 2px rgba(16,44,26,0.22);
  pointer-events:none;
}
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
  CustomOverlay: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
}
interface KakaoMapLike {
  getProjection?: () => KakaoProjection;
  getLevel?: () => number;
  setLevel?: (n: number, opts?: Record<string, unknown>) => void;
  panTo?: (latlng: unknown) => void;
}

// ── 겹침 제거 머지 ───────────────────────────────────────────
//   픽셀 투영 후 head 가 닿기 직전(반지름 합)까지만 허용. 다단계 반복.
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
  const radiusOf = (count: number) => headDiameter(count) / 2 + 3;

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
  const overlaysRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  const cbRef = useRef(onSelectListing);
  cbRef.current = onSelectListing;

  useEffect(() => { injectStyle(); }, []);

  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    for (const ov of overlaysRef.current) {
      try { ov.setMap(null); } catch { /* noop */ }
    }
    overlaysRef.current = [];

    const merged = mergeClusters(clusters, maps, map as KakaoMapLike);

    for (const m of merged) {
      const single = m.count <= 1;
      const headD = headDiameter(m.count);
      const geo = pinGeometry(headD);

      const el = document.createElement('div');
      el.className = 'scl-pin';
      el.style.width = `${headD}px`;
      el.style.height = `${geo.containerH}px`;

      const tail = document.createElement('div');
      tail.className = 'scl-tail';
      tail.style.top = `${geo.tailTop}px`;
      tail.style.borderLeftWidth = `${geo.tailHalf}px`;
      tail.style.borderRightWidth = `${geo.tailHalf}px`;
      tail.style.borderTopWidth = `${geo.tailH}px`;

      const head = document.createElement('div');
      head.className = 'scl-head';
      head.style.width = `${headD}px`;
      head.style.height = `${headD}px`;

      if (single) {
        const dot = document.createElement('div');
        dot.className = 'scl-dot';
        const ds = Math.round(headD * 0.34);
        dot.style.width = `${ds}px`;
        dot.style.height = `${ds}px`;
        head.appendChild(dot);
        el.dataset.singleId = String(m.ids[0] ?? '');
      } else {
        const num = document.createElement('span');
        num.className = 'scl-num';
        num.style.fontSize = `${Math.min(15, Math.max(11, Math.round(headD * 0.30)))}px`;
        num.textContent = formatCount(m.count);
        head.appendChild(num);
        el.dataset.clusterLat = String(m.lat);
        el.dataset.clusterLng = String(m.lng);
      }

      el.appendChild(tail);
      el.appendChild(head);

      const ov = new maps.CustomOverlay({
        position: new maps.LatLng(m.lat, m.lng),
        content: el,
        xAnchor: 0.5,
        yAnchor: 1.0,
        zIndex: single ? 90 : 100,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }
  }, [clusters, map]);

  useEffect(() => {
    if (!map) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const pin = target.closest('.scl-pin') as HTMLElement | null;
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
