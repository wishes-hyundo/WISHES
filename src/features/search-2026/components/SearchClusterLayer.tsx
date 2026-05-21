'use client';

/**
 * SearchClusterLayer — /search 지도 마커 (P5 · 애플지도 풍선 핀, SVG)
 *
 * 대표님 확정: 애플지도 둥근 풍선 핀. 원 + 삼각형 붙이기(X) — 매끈한 물방울.
 *   SVG path 로 head→tip 이 하나로 이어지는 진짜 teardrop 을 그린다.
 *
 *   · 클러스터(2개 이상) — 풍선 핀, head 안에 개수 숫자. 크기 = 개수 비례.
 *   · 개별 매물(1개)      — 풍선 핀, head 안에 흰 점.
 *   · 줌 적응 — 서버 클러스터 단위가 줌마다 바뀌고 머지 후 재배치·재크기.
 *   · SVG → 매끈한 곡선 + radialGradient 광택 + feDropShadow 부드러운 그림자.
 *   · 핀 tip 이 좌표에 앵커. /map 의 KakaoMarkerLayer 는 손대지 않음.
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

// ── 핀 픽셀 폭 — 개수 비례 단계 ──────────────────────────────
function pinWidth(count: number): number {
  if (count <= 1) return 36;
  if (count < 10) return 42;
  if (count < 50) return 48;
  if (count < 200) return 54;
  if (count < 1000) return 60;
  return 68;
}
const PIN_RATIO = 152 / 134;  // viewBox 높이/폭
const TIP_YANCHOR = 117 / 152; // tip(y=104) — viewBox(-13..139) 내 비율 ≈ 0.770

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

// 애플지도 스타일 둥근 풍선 핀 (2026-05-21 재디자인)
//   플럼프한 둥근 헤드(반지름40,중심50,44) + 짧은 꼬리(끝50,104).
//   불투명 바디 + 넓고 은은한 글래스 면발광 + 살짝의 톱 림라이트.
//   싼티 방지: 그라디언트 대비 약하게, 광택은 넓고 부드럽게, 그림자
//   는 옅게 떠 있는 느낌. 귀엽고 러블리하게 둥글둥글.
function pinSvg(count: number, single: boolean): string {
  const label = formatCount(count);
  const fs = label.length >= 4 ? 22 : label.length === 3 ? 26 : 30;
  const inner = single
    ? '<circle cx="50" cy="44" r="12.5" fill="#ffffff"/>' +
      '<circle cx="50" cy="44" r="4.9" fill="#1d9355"/>'
    : `<text x="50" y="45.5" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Rounded','SF Pro Display','Pretendard',sans-serif" font-weight="640" font-size="${fs}" letter-spacing="-1.2" fill="#ffffff">${label}</text>`;
  const D = 'M50,104 C36,84 14,73 14,44 A40,40 0 1,1 86,44 C86,73 64,84 50,104 Z';
  return (
    '<svg viewBox="-17 -13 134 152" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#39b074"/>' +
    '<stop offset="100%" stop-color="#1c9255"/>' +
    '</linearGradient>' +
    '<radialGradient id="wh" cx="50%" cy="31%" r="62%">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.40"/>' +
    '<stop offset="62%" stop-color="#ffffff" stop-opacity="0.06"/>' +
    '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="wr" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>' +
    '<stop offset="44%" stop-color="#ffffff" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<filter id="ws" x="-70%" y="-55%" width="240%" height="235%">' +
    '<feDropShadow dx="0" dy="3.5" stdDeviation="4" flood-color="#0c3a22" flood-opacity="0.26"/>' +
    '</filter>' +
    '</defs>' +
    `<path d="${D}" fill="url(#wg)" filter="url(#ws)"/>` +
    '<ellipse cx="50" cy="40" rx="32" ry="25" fill="url(#wh)"/>' +
    `<path d="${D}" fill="none" stroke="url(#wr)" stroke-width="1.4"/>` +
    inner +
    '</svg>'
  );
}

// ── 스타일 (주입 1회) ────────────────────────────────────────
const STYLE_ID = 'wishes-search-pin-style';
const STYLE_CSS = `
.scl-pin{
  position:relative;cursor:pointer;
  transform-origin:50% 91%;
  transition:transform .18s cubic-bezier(.16,1,.3,1);
}
.scl-pin:hover{transform:scale(1.08);z-index:400;}
.scl-pin:active{transform:scale(0.96);}
.scl-pin svg{display:block;width:100%;height:100%;overflow:visible;}
.scl-pin text{user-select:none;}
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
  // head 원의 화면 반지름 ≈ pinWidth * 0.30 (viewBox 상 head 지름 72/120)
  const radiusOf = (count: number) => pinWidth(count) * 0.30 + 3;

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
      const w = pinWidth(m.count);

      const el = document.createElement('div');
      el.className = 'scl-pin';
      el.style.width = `${w}px`;
      el.style.height = `${Math.round(w * PIN_RATIO)}px`;
      el.innerHTML = pinSvg(m.count, single);

      if (single) {
        el.dataset.singleId = String(m.ids[0] ?? '');
      } else {
        el.dataset.clusterLat = String(m.lat);
        el.dataset.clusterLng = String(m.lng);
      }

      const ov = new maps.CustomOverlay({
        position: new maps.LatLng(m.lat, m.lng),
        content: el,
        xAnchor: 0.5,
        yAnchor: TIP_YANCHOR,
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
