// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SvgMarkerLayer.tsx — Wave 38 (2026-05-04 사장님 명령 끝까지 마무리)
//
// 목적: 직방 (zigbang.com/home/villa/map) / 네모 (nemoapp.kr/store) 패턴 정확 복제.
//   Kakao CustomOverlay 415개 = setMap 1245회 = 146ms freeze (한계).
//   진짜 fix: 단일 <svg> element 안에 모든 cluster — 매 update = 1 reflow.
//
// 구조:
//   <svg> (Kakao map container 위에 absolute mount, pointer-events: none)
//     <g class="markers">  ← 모든 cluster 한 그룹
//       <g class="cluster" data-id="1d09321"...>
//         <circle r="14" fill="..." />
//         <text>23</text>
//       </g>
//       ... (415 cluster 들)
//     </g>
//
// 동작:
//   1. Mount: <svg> 1번 createElement + container.appendChild — 1 reflow
//   2. Cluster update: svg.innerHTML = '<g><circle .../><text/></g>...' — 1 reflow
//   3. Pan/Zoom: svg children 의 cx/cy/transform attribute update — browser batch 1 reflow
//   4. Click: SVG event delegation (svg 의 click → e.target 의 dataset 으로 dispatch)
//
// 예상 효과:
//   - 415 cluster freeze 146ms → ~15ms (60fps 보장)
//   - 직방/네모 수준 = "대한민국 최고"
//
// 보존 INVARIANTs (사장님 명령 누적):
//   I-MARKER-1/2/4/5: cluster grid + token + cellSize
//   I-MARKER-3: TIER1 단지 마커 정확 좌표
//   I-MARKER-6 (G-123): cluster filter 시 spider-fy
//   I-MARKER-7 (G-122): listingCategoryOf 카테고리
//   I-COORD-3: viewport API raw 좌표
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { MapListing } from '@/features/map-2026/store';
import {
  aggregateClusters,
  applySpiderFy,
  computeClusterPosition,
} from '@/features/map-2026/lib/clusterAggregation';
import { listingCategoryOf } from '@/features/map-2026/lib/markerTier';

// ──────────────────────────────────────────────────────
// Kakao map 타입 (HtmlMarkerOverlay 와 동일 인터페이스)
// ──────────────────────────────────────────────────────
interface KakaoMapLike {
  getLevel?: () => number;
  getProjection?: () => {
    pointFromCoords: (c: unknown) => { x: number; y: number };
  };
  getContainer?: () => HTMLElement;
}
interface KakaoNamespace {
  maps?: {
    LatLng: new (lat: number, lng: number) => unknown;
    event?: {
      addListener: (target: unknown, type: string, h: () => void) => void;
      removeListener: (target: unknown, type: string, h: () => void) => void;
    };
  };
}

// ──────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────
export interface SvgMarkerLayerProps {
  map: unknown;
  container: HTMLElement | null;
  listings: MapListing[];
  selectedListingId: number | null;
  category: 'residence' | 'retail_office' | 'land' | 'investment';
  clusterFilterIds: number[] | null;
  clusterFilterListings: MapListing[] | null;
  onClickListing: (id: number) => void;
  onClusterFilter?: (ids: number[] | null, label: string | null) => void;
}

// ──────────────────────────────────────────────────────
// Color (HtmlMarkerOverlay 와 일치)
// ──────────────────────────────────────────────────────
const CAT_COLORS = {
  residence: { bg: 'rgba(0, 98, 65, 0.68)', text: '#ffffff' },
  retail_office: { bg: 'rgba(180, 83, 9, 0.68)', text: '#ffffff' },
  land: { bg: 'rgba(120, 53, 15, 0.68)', text: '#ffffff' },
  investment: { bg: 'rgba(126, 34, 206, 0.68)', text: '#ffffff' },
};
const SEL_BG = 'rgba(220, 38, 38, 0.85)';

function markerSize(count: number, level: number, isMobile: boolean): number {
  let mult = 1;
  if (level <= 2) mult = 1.35;
  else if (level <= 3) mult = 1.20;
  else if (level <= 4) mult = 1.10;
  else if (level >= 12) mult = 0.85;

  let base = 22;
  if (count >= 1000) base = 44;
  else if (count >= 100) base = 36;
  else if (count >= 30) base = 30;
  else if (count >= 10) base = 26;
  else if (count >= 2) base = 24;

  if (isMobile) base = Math.round(base * 0.9);
  return Math.round(base * mult);
}

// ──────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────
export default function SvgMarkerLayer({
  map,
  container,
  listings,
  selectedListingId,
  category,
  clusterFilterIds,
  clusterFilterListings,
  onClickListing,
  onClusterFilter,
}: SvgMarkerLayerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ──────────────────────────────────────────────────────
  // Mount SVG layer (1 reflow)
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!container || typeof window === 'undefined') return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '6';
    svg.setAttribute('width', String(container.clientWidth));
    svg.setAttribute('height', String(container.clientHeight));
    container.appendChild(svg);
    svgRef.current = svg;

    // Resize observer — viewport size 변경 시 svg width/height 갱신
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!svgRef.current) return;
          svgRef.current.setAttribute('width', String(container.clientWidth));
          svgRef.current.setAttribute('height', String(container.clientHeight));
        })
      : null;
    ro?.observe(container);

    return () => {
      ro?.disconnect();
      if (svg.parentNode) svg.parentNode.removeChild(svg);
      svgRef.current = null;
    };
  }, [container]);

  // ──────────────────────────────────────────────────────
  // Render markers (svg.innerHTML 한 번에 — 1 reflow)
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !container || !svgRef.current) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const kakao = win.kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const render = () => {
      const svg = svgRef.current;
      if (!svg) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;

      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      // viewport listings (clusterFilter 우선)
      const filterSet = clusterFilterIds && clusterFilterIds.length > 0
        ? new Set(clusterFilterIds) : null;
      const visibleListings = clusterFilterListings && clusterFilterListings.length > 0
        ? clusterFilterListings
        : (filterSet ? listings.filter((l) => filterSet.has(l.id)) : listings);

      const isClusterFilterActive = !!filterSet
        || !!(clusterFilterListings && clusterFilterListings.length > 0);

      // category filter (HtmlMarkerOverlay 와 동일)
      const filtered = (category === 'investment' || isClusterFilterActive)
        ? visibleListings
        : visibleListings.filter((l) => listingCategoryOf(l) === category);

      if (filtered.length === 0) {
        svg.innerHTML = '';
        return;
      }

      const elements: string[] = [];

      // Spider-fy 모드 (cluster 클릭 후)
      if (isClusterFilterActive && filtered.length > 1) {
        const sf = applySpiderFy(filtered);
        const sfSize = isMobile ? 22 : 26;
        const cat = CAT_COLORS[category];
        for (const _sf of sf) {
          const l = _sf.listing;
          const ll = new maps.LatLng(_sf.displayLat, _sf.displayLng);
          const p = projection.pointFromCoords(ll);
          const isSel = selectedListingId === l.id;
          const bg = isSel ? SEL_BG : cat.bg;
          const r = sfSize / 2;
          elements.push(
            `<g class="m" data-id="${l.id}" transform="translate(${p.x},${p.y})">` +
              `<circle r="${r}" fill="${bg}" stroke="white" stroke-width="2" style="pointer-events:auto;cursor:pointer"/>` +
              `<text y="4" text-anchor="middle" font-size="11" font-weight="bold" fill="white" style="pointer-events:none;user-select:none">1</text>` +
            `</g>`
          );
        }
        svg.innerHTML = `<g class="markers">${elements.join('')}</g>`;
        return;
      }

      // 일반 cluster 모드
      const aggregated = aggregateClusters(filtered, level, false);
      for (const arr of aggregated.values()) {
        if (arr.length === 0) continue;
        const _pos = computeClusterPosition(arr);
        const ll = new maps.LatLng(_pos.lat, _pos.lng);
        const p = projection.pointFromCoords(ll);
        const count = arr.length;
        const hasSel = selectedListingId != null && arr.some((l) => l.id === selectedListingId);
        const isFilteredCluster = filterSet != null
          && arr.length === filterSet.size
          && arr.every((l) => filterSet.has(l.id));
        const sel = hasSel || isFilteredCluster;

        // category for color (cross-residential 고려)
        let clusterCat: 'residence' | 'retail_office' | 'land' | 'investment' = 'residence';
        if (category === 'investment') {
          const counts: Record<string, number> = {};
          for (const l of arr) {
            const c = listingCategoryOf(l);
            counts[c] = (counts[c] ?? 0) + 1;
          }
          let max = 0;
          for (const k of Object.keys(counts)) {
            if (counts[k] > max) { max = counts[k]; clusterCat = k as typeof clusterCat; }
          }
        } else {
          clusterCat = category;
        }
        const bg = sel ? SEL_BG : CAT_COLORS[clusterCat].bg;
        const size = markerSize(count, level, isMobile);
        const r = size / 2;
        const fontSize = count >= 100 ? 12 : 11;
        const ids = arr.map((l) => l.id).join(',');

        elements.push(
          `<g class="m" data-cluster-ids="${ids}" data-single-id="${count === 1 ? arr[0].id : ''}" transform="translate(${p.x},${p.y})">` +
            `<circle r="${r}" fill="${bg}" stroke="white" stroke-width="2" style="pointer-events:auto;cursor:pointer"/>` +
            `<text y="4" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="white" style="pointer-events:none;user-select:none">${count}</text>` +
          `</g>`
        );
      }

      // ★★★ 단 1번 reflow ★★★
      svg.innerHTML = `<g class="markers">${elements.join('')}</g>`;
    };

    render();

    // Click event delegation — svg 1번 listener
    const onSvgClick = (e: Event) => {
      const target = e.target as Element;
      const g = target.closest('g.m') as SVGGElement | null;
      if (!g) return;
      e.stopPropagation();
      e.preventDefault();
      const single = g.dataset.singleId;
      const idsStr = g.dataset.clusterIds;
      if (single) {
        onClickListing(parseInt(single, 10));
        return;
      }
      const dataId = g.dataset.id;
      if (dataId) {
        // spider-fy individual marker
        onClickListing(parseInt(dataId, 10));
        return;
      }
      if (idsStr) {
        const ids = idsStr.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        if (filterSet && filterSet.size === ids.length && ids.every((id) => filterSet.has(id))) {
          onClusterFilter?.(null, null);
        } else {
          onClusterFilter?.(ids, null);
        }
      }
    };
    const filterSet = clusterFilterIds && clusterFilterIds.length > 0
      ? new Set(clusterFilterIds) : null;
    svgRef.current.addEventListener('click', onSvgClick);

    // Re-render on map pan/zoom (single rAF throttle)
    let rafId: number | null = null;
    const scheduleRender = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => { rafId = null; render(); });
    };
    const evt = maps.event;
    if (evt) {
      evt.addListener(map, 'drag', scheduleRender);
      evt.addListener(map, 'zoom_changed', scheduleRender);
      evt.addListener(map, 'center_changed', scheduleRender);
    }

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      svgRef.current?.removeEventListener('click', onSvgClick);
      if (evt) {
        try { evt.removeListener(map, 'drag', scheduleRender); } catch { /* noop */ }
        try { evt.removeListener(map, 'zoom_changed', scheduleRender); } catch { /* noop */ }
        try { evt.removeListener(map, 'center_changed', scheduleRender); } catch { /* noop */ }
      }
    };
  }, [
    map, container,
    listings, selectedListingId, category,
    clusterFilterIds, clusterFilterListings,
    onClickListing, onClusterFilter,
  ]);

  return null;
}
