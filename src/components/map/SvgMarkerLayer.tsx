// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SvgMarkerLayer.tsx — Wave 43 (2026-05-04) Web Worker off-main aggregation
//
// 누적 진화:
//   Wave 38: 단일 SVG element + zigbang/nemo 패턴
//   Wave 41: pan vs zoom 분기 (per-g transform)
//   Wave 42: parent g single transform pan (1 setAttribute) — pan 0ms 달성
//   Wave 43: cluster aggregation 을 Web Worker 로 → main thread zoom freeze 95ms → ~20-30ms
//
// 동작 변경:
//   - Worker 가능 시: postMessage(render) → 받은 ClusterRenderItem[] 으로 SVG string 조립
//   - Worker 실패 시: 기존 sync 로직 fallback (Wave 42 와 동일)
//   - Pan 경로 (parent g transform) 는 worker 호출 X — 그대로 0ms
//
// 보존 INVARIANTs:
//   I-MARKER-1/2/3/4/5/6/7 (cluster 로직 — clusterAggregation.ts/markerTier.ts 재사용)
//   I-COORD-3 (raw lat/lng)
//   I-PERF-1 (rAF batching — 이제 Worker 가 보완)
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
// Worker 메시지 타입 (svg-cluster.worker.ts 와 동일)
// ──────────────────────────────────────────────────────
interface ClusterRenderItem {
  lat: number;
  lng: number;
  r: number;
  fontSize: number;
  bg: string;
  count: number;
  ids: string;
  singleId: string;
  isSpiderFy: boolean;
  spiderFyId: number;
}
interface RenderResultMsg {
  type: 'render-result';
  reqId: number;
  items: ClusterRenderItem[];
  anchorLat: number;
  anchorLng: number;
}

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
// Color (worker 와 일치)
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
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(0);

  // ──────────────────────────────────────────────────────
  // Mount SVG layer (1 reflow) + Worker boot
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

    // Worker 부팅 (best-effort — 실패 시 sync fallback)
    try {
      if (typeof Worker !== 'undefined') {
        const w = new Worker(
          new URL('../../features/map-2026/workers/svg-cluster.worker.ts', import.meta.url),
          { type: 'module' },
        );
        workerRef.current = w;
      }
    } catch {
      workerRef.current = null;
    }

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
      try { workerRef.current?.terminate(); } catch { /* noop */ }
      workerRef.current = null;
    };
  }, [container]);

  // ──────────────────────────────────────────────────────
  // Worker 에 listings 캐시 sync (listings 변경 시 1번만 전송 — structured clone 비용 절감)
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    try {
      w.postMessage({ type: 'setListings', listings });
    } catch { /* noop */ }
  }, [listings]);

  // ──────────────────────────────────────────────────────
  // Render markers
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !container || !svgRef.current) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const kakao = win.kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    // pan/zoom 분기 + parent g single transform (Wave 42 유지)
    let lastLevel = -1;
    let anchorLat = 0;
    let anchorLng = 0;
    let anchorPx = { x: 0, y: 0 };

    // Cluster filterSet (cleanup + click 양쪽에서 사용)
    const filterSet = clusterFilterIds && clusterFilterIds.length > 0
      ? new Set(clusterFilterIds) : null;

    // ────────────────────────────────────────────────
    // 결과 (ClusterRenderItem[]) 를 SVG string + innerHTML 로 commit
    // ────────────────────────────────────────────────
    const commitItems = (
      items: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const svg = svgRef.current;
      if (!svg) return;
      if (items.length === 0) {
        svg.innerHTML = '';
        return;
      }
      const elements: string[] = [];
      for (const it of items) {
        const ll = new maps.LatLng(it.lat, it.lng);
        const p = projection.pointFromCoords(ll);
        if (it.isSpiderFy) {
          elements.push(
            `<g class="m" data-id="${it.spiderFyId}" data-lat="${it.lat}" data-lng="${it.lng}" transform="translate(${p.x},${p.y})">` +
              `<circle r="${it.r}" fill="${it.bg}" stroke="white" stroke-width="2" style="pointer-events:auto;cursor:pointer"/>` +
              `<text y="4" text-anchor="middle" font-size="${it.fontSize}" font-weight="bold" fill="white" style="pointer-events:none;user-select:none">1</text>` +
            `</g>`
          );
        } else {
          elements.push(
            `<g class="m" data-cluster-ids="${it.ids}" data-single-id="${it.singleId}" data-lat="${it.lat}" data-lng="${it.lng}" transform="translate(${p.x},${p.y})">` +
              `<circle r="${it.r}" fill="${it.bg}" stroke="white" stroke-width="2" style="pointer-events:auto;cursor:pointer"/>` +
              `<text y="4" text-anchor="middle" font-size="${it.fontSize}" font-weight="bold" fill="white" style="pointer-events:none;user-select:none">${it.count}</text>` +
            `</g>`
          );
        }
      }
      // ★★★ 단 1번 reflow ★★★
      svg.innerHTML = `<g class="markers">${elements.join('')}</g>`;
      // anchor 저장 (pan delta 계산용)
      if (anchorL !== 0 || anchorN !== 0) {
        anchorLat = anchorL;
        anchorLng = anchorN;
        const ap = projection.pointFromCoords(new maps.LatLng(anchorL, anchorN));
        anchorPx = { x: ap.x, y: ap.y };
      }
    };

    // ────────────────────────────────────────────────
    // Sync fallback (worker 사용 불가 시 — Wave 42 로직 그대로)
    // ────────────────────────────────────────────────
    const syncRender = () => {
      const projection = mapInst.getProjection?.();
      if (!projection) return;

      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      const visibleListings = clusterFilterListings && clusterFilterListings.length > 0
        ? clusterFilterListings
        : (filterSet ? listings.filter((l) => filterSet.has(l.id)) : listings);
      const isClusterFilterActive = !!filterSet
        || !!(clusterFilterListings && clusterFilterListings.length > 0);
      const filtered = (category === 'investment' || isClusterFilterActive)
        ? visibleListings
        : visibleListings.filter((l) => listingCategoryOf(l) === category);

      const items: ClusterRenderItem[] = [];
      let anchorL = 0; let anchorN = 0; let firstAnchor = false;

      if (filtered.length === 0) {
        commitItems(items, 0, 0, projection);
        return;
      }

      if (isClusterFilterActive && filtered.length > 1) {
        const sf = applySpiderFy(filtered);
        const sfSize = isMobile ? 22 : 26;
        const cat = CAT_COLORS[category];
        for (const _sf of sf) {
          const l = _sf.listing;
          const isSel = selectedListingId === l.id;
          const bg = isSel ? SEL_BG : cat.bg;
          items.push({
            lat: _sf.displayLat, lng: _sf.displayLng,
            r: sfSize / 2, fontSize: 11, bg, count: 1,
            ids: '', singleId: '', isSpiderFy: true, spiderFyId: l.id,
          });
          if (!firstAnchor) { anchorL = _sf.displayLat; anchorN = _sf.displayLng; firstAnchor = true; }
        }
        commitItems(items, anchorL, anchorN, projection);
        return;
      }

      const aggregated = aggregateClusters(filtered, level, false);
      for (const arr of aggregated.values()) {
        if (arr.length === 0) continue;
        const _pos = computeClusterPosition(arr);
        const count = arr.length;
        const hasSel = selectedListingId != null && arr.some((l) => l.id === selectedListingId);
        const isFilteredCluster = filterSet != null
          && arr.length === filterSet.size
          && arr.every((l) => filterSet.has(l.id));
        const sel = hasSel || isFilteredCluster;
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
        const fontSize = count >= 100 ? 12 : 11;
        const ids = arr.map((l) => l.id).join(',');
        items.push({
          lat: _pos.lat, lng: _pos.lng,
          r: size / 2, fontSize, bg, count, ids,
          singleId: count === 1 ? String(arr[0].id) : '',
          isSpiderFy: false, spiderFyId: 0,
        });
        if (!firstAnchor) { anchorL = _pos.lat; anchorN = _pos.lng; firstAnchor = true; }
      }
      commitItems(items, anchorL, anchorN, projection);
    };

    // ────────────────────────────────────────────────
    // Worker 응답 핸들러 (단발 응답 — 매 render 마다 새 reqId)
    // ────────────────────────────────────────────────
    const onWorkerMessage = (e: MessageEvent<RenderResultMsg>) => {
      const data = e.data;
      if (!data || data.type !== 'render-result') return;
      // stale frame guard — 진행 중인 최신 reqId 만 commit
      if (data.reqId !== reqIdRef.current) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      commitItems(data.items, data.anchorLat, data.anchorLng, projection);
    };
    workerRef.current?.addEventListener('message', onWorkerMessage);

    const render = () => {
      const svg = svgRef.current;
      if (!svg) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;

      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      // pan path: parent g transform only (1 setAttribute) — Wave 42
      if (lastLevel === level && svg.children.length > 0) {
        const markersG = svg.firstElementChild as SVGGElement | null;
        if (markersG) {
          const ll = new maps.LatLng(anchorLat, anchorLng);
          const p = projection.pointFromCoords(ll);
          const dx = p.x - anchorPx.x;
          const dy = p.y - anchorPx.y;
          markersG.setAttribute('transform', `translate(${dx},${dy})`);
          return;
        }
      }
      lastLevel = level;

      // zoom / mount / category change path: full rebuild
      if (workerRef.current) {
        // Worker 경로 (off-main aggregation)
        reqIdRef.current += 1;
        try {
          workerRef.current.postMessage({
            type: 'render',
            reqId: reqIdRef.current,
            level,
            category,
            clusterFilterIds: clusterFilterIds ?? null,
            clusterFilterListings: clusterFilterListings ?? null,
            selectedListingId,
            isMobile,
          });
        } catch {
          // postMessage 실패 → sync fallback
          syncRender();
        }
      } else {
        // sync fallback
        syncRender();
      }
    };

    render();

    // Click event delegation
    const onSvgClick = (e: Event) => {
      const target = e.target as Element;
      const g = target.closest('g.m') as SVGGElement | null;
      if (!g) return;
      e.stopPropagation();
      e.preventDefault();
      const single = g.dataset.singleId;
      const idsStr = g.dataset.clusterIds;
      const dataId = g.dataset.id;
      if (single) {
        onClickListing(parseInt(single, 10));
        return;
      }
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
      workerRef.current?.removeEventListener('message', onWorkerMessage);
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
