// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SvgMarkerLayer.tsx — Wave 46 (2026-05-04 사장님 명령 "끝까지 직진")
//
// 누적 진화:
//   Wave 38: 단일 SVG element + zigbang/nemo 패턴
//   Wave 41: pan vs zoom 분기 (per-g transform)
//   Wave 42: parent g single transform pan (1 setAttribute) — pan 0ms 달성
//   Wave 43: cluster aggregation Web Worker → main thread zoom freeze 95ms → 60ms
//   Wave 44: SVG 기본화
//   Wave 45 ROLLBACK 안 함 (HtmlMarkerOverlay 그대로 mount, 회귀 없음)
//   Wave 46: ★ svg.innerHTML 완전 폐기 + DOM reuse 패턴
//
// 진짜 bottleneck (Wave 45 측정 실패 후 재진단):
//   `svg.innerHTML = '<g>...</g>'` 이 매 zoom 마다 호출됨
//   = browser parser (HTML→SVG) + reflow 30ms
//   53 cluster × 3 child = 159 DOM node 매번 destroy + create
//
// Wave 46 fix:
//   1. Map<key, SVGGElement> 으로 기존 cluster 추적
//   2. Worker 응답 받으면 ClusterRenderItem[] 의 ids 를 key 로 사용
//   3. 같은 key 존재 → 기존 g 의 transform 만 update (1 setAttribute, no reflow)
//   4. 새 key → createElementNS + appendChild (1 reflow per new)
//   5. 사라진 key → removeChild (1 reflow per removed)
//   6. innerHTML 호출 0번
//
// 효과 (예상):
//   - zoom freeze 60ms → 10~15ms (innerHTML reflow 30ms 절감)
//   - 같은 cluster 가 다른 zoom 에서 재사용되면 추가 절감
//   - pan 회귀 (Wave 45 의 52ms) 도 자연 fix — DOM 자체가 안 변함
//
// 보존 INVARIANTs:
//   I-MARKER-1/2/3/4/5/6/7 (cluster 로직 — worker 가 처리)
//   I-COORD-3 (raw lat/lng)
//   I-PERF-2 (3-layer 영구 보존)
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
// Kakao map 타입
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
// Color
// ──────────────────────────────────────────────────────
const CAT_COLORS = {
  residence: { bg: 'rgba(0, 98, 65, 0.68)', text: '#ffffff' },
  retail_office: { bg: 'rgba(180, 83, 9, 0.68)', text: '#ffffff' },
  land: { bg: 'rgba(120, 53, 15, 0.68)', text: '#ffffff' },
  investment: { bg: 'rgba(126, 34, 206, 0.68)', text: '#ffffff' },
};
const SEL_BG = 'rgba(220, 38, 38, 0.85)';
const SVG_NS = 'http://www.w3.org/2000/svg';

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
// 단일 cluster <g> 생성 (DOM reuse 시에도 spec 동일)
// ──────────────────────────────────────────────────────
function createClusterG(it: ClusterRenderItem, x: number, y: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('class', 'm');
  if (it.isSpiderFy) {
    g.setAttribute('data-id', String(it.spiderFyId));
  } else {
    g.setAttribute('data-cluster-ids', it.ids);
    g.setAttribute('data-single-id', it.singleId);
  }
  g.setAttribute('data-lat', String(it.lat));
  g.setAttribute('data-lng', String(it.lng));
  g.setAttribute('transform', `translate(${x},${y})`);

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('r', String(it.r));
  circle.setAttribute('fill', it.bg);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('style', 'pointer-events:auto;cursor:pointer');
  g.appendChild(circle);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('y', '4');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', String(it.fontSize));
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('fill', 'white');
  text.setAttribute('style', 'pointer-events:none;user-select:none');
  text.textContent = it.isSpiderFy ? '1' : String(it.count);
  g.appendChild(text);

  return g;
}

// 기존 g 업데이트 (transform + 변경 가능 속성만)
function updateClusterG(g: SVGGElement, it: ClusterRenderItem, x: number, y: number) {
  g.setAttribute('transform', `translate(${x},${y})`);
  // 색상이 변할 수 있음 (selected 상태 등)
  const circle = g.firstElementChild as SVGCircleElement | null;
  if (circle) {
    if (circle.getAttribute('fill') !== it.bg) circle.setAttribute('fill', it.bg);
    const rs = String(it.r);
    if (circle.getAttribute('r') !== rs) circle.setAttribute('r', rs);
  }
  const text = g.lastElementChild as SVGTextElement | null;
  if (text) {
    const newCount = it.isSpiderFy ? '1' : String(it.count);
    if (text.textContent !== newCount) text.textContent = newCount;
    const fs = String(it.fontSize);
    if (text.getAttribute('font-size') !== fs) text.setAttribute('font-size', fs);
  }
}

// item key 추출 (worker 와 main 양쪽 동일 규칙)
function keyOf(it: ClusterRenderItem): string {
  if (it.isSpiderFy) return 's:' + it.spiderFyId;
  if (it.singleId) return '1:' + it.singleId;
  return 'c:' + it.ids;  // cluster ids 가 unique key
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
  const markersGRef = useRef<SVGGElement | null>(null);
  const clusterMapRef = useRef<Map<string, SVGGElement>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(0);
  // Wave 47 (2026-05-04 사장님 명령 "끝까지 직진"): pan anchor 영속 ref.
  //   Wave 46 측정에서 pan 137ms 회귀 발견. 원인: lastLevel/anchorLat/anchorLng/anchorPx 가
  //   useEffect 안의 local 변수라 listings prop 변경 시 useEffect 재실행 → 모두 reset →
  //   pan path 못 거치고 매번 worker 호출 + 53 신규 cluster create = 137ms.
  //   해결: useRef 로 옮겨서 useEffect 재실행에도 살아남음. pan 0ms 복원.
  const lastLevelRef = useRef<number>(-1);
  const anchorLatRef = useRef<number>(0);
  const anchorLngRef = useRef<number>(0);
  const anchorPxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ──────────────────────────────────────────────────────
  // Mount SVG layer + parent g.markers + Worker boot
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!container || typeof window === 'undefined') return;
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
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

    // parent g.markers 한 번 생성 (Wave 42 anchor pan 의 핵심)
    const markersG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    markersG.setAttribute('class', 'markers');
    svg.appendChild(markersG);
    markersGRef.current = markersG;

    // Worker boot
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

    // Resize observer
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
      markersGRef.current = null;
      clusterMapRef.current.clear();
      try { workerRef.current?.terminate(); } catch { /* noop */ }
      workerRef.current = null;
    };
  }, [container]);

  // ──────────────────────────────────────────────────────
  // Worker 에 listings 캐시
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    try {
      w.postMessage({ type: 'setListings', listings });
    } catch { /* noop */ }
  }, [listings]);

  // ──────────────────────────────────────────────────────
  // Render markers (Wave 46 DOM reuse)
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !container || !svgRef.current || !markersGRef.current) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const kakao = win.kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    // Wave 47: pan anchor refs (persistent across useEffect re-runs).
    //   listings prop 변경 시 useEffect 재실행되어도 anchor 가 살아남아 pan path 유지.
    const filterSet = clusterFilterIds && clusterFilterIds.length > 0
      ? new Set(clusterFilterIds) : null;

    // ────────────────────────────────────────────────
    // Wave 46 핵심: ClusterRenderItem[] → DOM diff (innerHTML 0회)
    // ────────────────────────────────────────────────
    const commitItems = (
      items: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const markersG = markersGRef.current;
      if (!markersG) return;

      // Wave 42: zoom 시 parent transform reset (pan delta 누적 방지)
      markersG.setAttribute('transform', '');

      const oldMap = clusterMapRef.current;
      const newMap = new Map<string, SVGGElement>();
      const seen = new Set<string>();

      // Pass 1: 새 items 처리 — 기존 재사용 또는 신규 생성
      for (const it of items) {
        const key = keyOf(it);
        if (seen.has(key)) continue;  // 중복 방어
        seen.add(key);

        const ll = new maps.LatLng(it.lat, it.lng);
        const p = projection.pointFromCoords(ll);

        const existing = oldMap.get(key);
        if (existing) {
          // 재사용 (no reflow, just attr update)
          updateClusterG(existing, it, p.x, p.y);
          newMap.set(key, existing);
          oldMap.delete(key);  // 처리됨 표시
        } else {
          // 신규 생성
          const g = createClusterG(it, p.x, p.y);
          markersG.appendChild(g);
          newMap.set(key, g);
        }
      }

      // Pass 2: 사라진 cluster 제거
      for (const g of oldMap.values()) {
        if (g.parentNode === markersG) markersG.removeChild(g);
      }

      clusterMapRef.current = newMap;

      // anchor 저장 (다음 pan delta 계산)
      if (anchorL !== 0 || anchorN !== 0) {
        anchorLatRef.current = anchorL;
        anchorLngRef.current = anchorN;
        const ap = projection.pointFromCoords(new maps.LatLng(anchorL, anchorN));
        anchorPxRef.current = { x: ap.x, y: ap.y };
      }
    };

    // ────────────────────────────────────────────────
    // Sync fallback (worker 부팅 실패 시)
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
    // Worker 응답 핸들러
    // ────────────────────────────────────────────────
    const onWorkerMessage = (e: MessageEvent<RenderResultMsg>) => {
      const data = e.data;
      if (!data || data.type !== 'render-result') return;
      if (data.reqId !== reqIdRef.current) return;  // stale frame guard
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      commitItems(data.items, data.anchorLat, data.anchorLng, projection);
    };
    workerRef.current?.addEventListener('message', onWorkerMessage);

    const render = () => {
      const svg = svgRef.current;
      const markersG = markersGRef.current;
      if (!svg || !markersG) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;

      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      // Pan path: 같은 level + 기존 cluster 있음 → parent g translate (1 setAttribute)
      if (lastLevelRef.current === level && clusterMapRef.current.size > 0) {
        const ll = new maps.LatLng(anchorLatRef.current, anchorLngRef.current);
        const p = projection.pointFromCoords(ll);
        const dx = p.x - anchorPxRef.current.x;
        const dy = p.y - anchorPxRef.current.y;
        markersG.setAttribute('transform', `translate(${dx},${dy})`);
        return;
      }
      lastLevelRef.current = level;

      // Zoom / mount / category 변경: full re-aggregate via worker
      if (workerRef.current) {
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
          syncRender();
        }
      } else {
        syncRender();
      }
    };

    render();

    // Click event delegation (svgRef 자체에 1개)
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

    // Pan/zoom event listener (rAF throttle)
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
