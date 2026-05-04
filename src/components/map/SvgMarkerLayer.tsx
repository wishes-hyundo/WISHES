// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SvgMarkerLayer.tsx — Wave 52 (2026-05-04 사장님 명령 "끝까지 무조건")
//
// Wave 50 Canvas trace 진단 결과: commit 자체 = 2.5ms, longtask 89ms 의 86ms 가
//   useEffect re-run 비용 (listener add/remove × 6 매 listings 변경마다).
// Wave 51 가 Canvas 에 mount-only useEffect + propsRef 패턴 적용.
// Wave 52 = ★ default SvgMarkerLayer 도 동일 패턴 적용 (default 사용자 혜택).
//
// 변경:
//   1. propsRef 로 모든 dynamic prop 보관
//   2. useEffect [map, container] = mount-only — listener / svg / worker 1번 setup
//   3. listings 변경 = postMessage worker + render() 호출만 (no useEffect re-mount)
//   4. category / filter 변경 = render() 호출만
//
// 보존: Wave 38~48 의 모든 최적화 (Path2D 없지만 SVG DOM reuse + element pool)
//   - 단일 SVG element + parent g.markers
//   - Map<key, SVGGElement> reuse (Wave 46)
//   - Anchor refs persistent (Wave 47)
//   - Element pool (Wave 48)
//   - Worker offload (Wave 43)
//   - Pan parent g translate (Wave 42)
//
// 예상: zoom freeze 50ms → ~5ms (commit 자체만 남음).
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

function updateClusterG(g: SVGGElement, it: ClusterRenderItem, x: number, y: number) {
  g.setAttribute('transform', `translate(${x},${y})`);
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

function keyOf(it: ClusterRenderItem): string {
  if (it.isSpiderFy) return 's:' + it.spiderFyId;
  if (it.singleId) return '1:' + it.singleId;
  return 'c:' + it.ids;
}

export default function SvgMarkerLayer(props: SvgMarkerLayerProps) {
  // Wave 52: propsRef 로 모든 dynamic prop (useEffect re-run 회피)
  const propsRef = useRef(props);
  propsRef.current = props;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const markersGRef = useRef<SVGGElement | null>(null);
  const clusterMapRef = useRef<Map<string, SVGGElement>>(new Map());
  const poolRef = useRef<SVGGElement[]>([]);
  const POOL_MAX = 200;
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(0);
  const lastLevelRef = useRef<number>(-1);
  const anchorLatRef = useRef<number>(0);
  const anchorLngRef = useRef<number>(0);
  const anchorPxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const renderRef = useRef<() => void>(() => {});

  // Wave 52: Mount-only useEffect [map, container]
  useEffect(() => {
    if (!props.map || !props.container || typeof window === 'undefined') return;
    const container = props.container;
    const map = props.map;

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

    const markersG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    markersG.setAttribute('class', 'markers');
    svg.appendChild(markersG);
    markersGRef.current = markersG;

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

    const win = window as unknown as { kakao?: KakaoNamespace };
    const kakao = win.kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const commitItems = (
      items: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const mg = markersGRef.current;
      if (!mg) return;
      mg.setAttribute('transform', '');

      const oldMap = clusterMapRef.current;
      const newMap = new Map<string, SVGGElement>();
      const seen = new Set<string>();
      const pool = poolRef.current;

      for (const it of items) {
        const key = keyOf(it);
        if (seen.has(key)) continue;
        seen.add(key);

        const ll = new maps.LatLng(it.lat, it.lng);
        const p = projection.pointFromCoords(ll);

        const existing = oldMap.get(key);
        if (existing) {
          updateClusterG(existing, it, p.x, p.y);
          newMap.set(key, existing);
          oldMap.delete(key);
        } else if (pool.length > 0) {
          const g = pool.pop()!;
          if (g.style.display === 'none') g.style.display = '';
          if (it.isSpiderFy) {
            g.setAttribute('data-id', String(it.spiderFyId));
            g.removeAttribute('data-cluster-ids');
            g.removeAttribute('data-single-id');
          } else {
            g.removeAttribute('data-id');
            g.setAttribute('data-cluster-ids', it.ids);
            g.setAttribute('data-single-id', it.singleId);
          }
          g.setAttribute('data-lat', String(it.lat));
          g.setAttribute('data-lng', String(it.lng));
          updateClusterG(g, it, p.x, p.y);
          if (g.parentNode !== mg) mg.appendChild(g);
          newMap.set(key, g);
        } else {
          const g = createClusterG(it, p.x, p.y);
          mg.appendChild(g);
          newMap.set(key, g);
        }
      }

      for (const g of oldMap.values()) {
        if (pool.length < POOL_MAX) {
          g.style.display = 'none';
          pool.push(g);
        } else {
          if (g.parentNode === mg) mg.removeChild(g);
        }
      }

      clusterMapRef.current = newMap;

      if (anchorL !== 0 || anchorN !== 0) {
        anchorLatRef.current = anchorL;
        anchorLngRef.current = anchorN;
        const ap = projection.pointFromCoords(new maps.LatLng(anchorL, anchorN));
        anchorPxRef.current = { x: ap.x, y: ap.y };
      }
    };

    const syncRender = () => {
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const p = propsRef.current;

      const filterSet = p.clusterFilterIds && p.clusterFilterIds.length > 0
        ? new Set(p.clusterFilterIds) : null;
      const visibleListings = p.clusterFilterListings && p.clusterFilterListings.length > 0
        ? p.clusterFilterListings
        : (filterSet ? p.listings.filter((l) => filterSet.has(l.id)) : p.listings);
      const isClusterFilterActive = !!filterSet
        || !!(p.clusterFilterListings && p.clusterFilterListings.length > 0);
      const filtered = (p.category === 'investment' || isClusterFilterActive)
        ? visibleListings
        : visibleListings.filter((l) => listingCategoryOf(l) === p.category);

      const items: ClusterRenderItem[] = [];
      let anchorL = 0; let anchorN = 0; let firstAnchor = false;

      if (filtered.length === 0) { commitItems(items, 0, 0, projection); return; }

      if (isClusterFilterActive && filtered.length > 1) {
        const sf = applySpiderFy(filtered);
        const sfSize = isMobile ? 22 : 26;
        const cat = CAT_COLORS[p.category];
        for (const _sf of sf) {
          const l = _sf.listing;
          const isSel = p.selectedListingId === l.id;
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
        const hasSel = p.selectedListingId != null && arr.some((l) => l.id === p.selectedListingId);
        const isFilteredCluster = filterSet != null
          && arr.length === filterSet.size
          && arr.every((l) => filterSet.has(l.id));
        const sel = hasSel || isFilteredCluster;
        let clusterCat: 'residence' | 'retail_office' | 'land' | 'investment' = 'residence';
        if (p.category === 'investment') {
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
          clusterCat = p.category;
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

    const onWorkerMessage = (e: MessageEvent<RenderResultMsg>) => {
      const data = e.data;
      if (!data || data.type !== 'render-result') return;
      if (data.reqId !== reqIdRef.current) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      commitItems(data.items, data.anchorLat, data.anchorLng, projection);
    };
    workerRef.current?.addEventListener('message', onWorkerMessage);

    const render = () => {
      const sv = svgRef.current;
      const mg = markersGRef.current;
      if (!sv || !mg) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const p = propsRef.current;

      // Pan path: same level → parent g translate
      if (lastLevelRef.current === level && clusterMapRef.current.size > 0) {
        const ll = new maps.LatLng(anchorLatRef.current, anchorLngRef.current);
        const pp = projection.pointFromCoords(ll);
        const dx = pp.x - anchorPxRef.current.x;
        const dy = pp.y - anchorPxRef.current.y;
        mg.setAttribute('transform', `translate(${dx},${dy})`);
        return;
      }
      lastLevelRef.current = level;

      if (workerRef.current) {
        reqIdRef.current += 1;
        try {
          workerRef.current.postMessage({
            type: 'render',
            reqId: reqIdRef.current,
            level,
            category: p.category,
            clusterFilterIds: p.clusterFilterIds ?? null,
            clusterFilterListings: p.clusterFilterListings ?? null,
            selectedListingId: p.selectedListingId,
            isMobile,
          });
        } catch {
          syncRender();
        }
      } else {
        syncRender();
      }
    };
    renderRef.current = render;
    render();

    const onSvgClick = (e: Event) => {
      const target = e.target as Element;
      const g = target.closest('g.m') as SVGGElement | null;
      if (!g) return;
      e.stopPropagation();
      e.preventDefault();
      const p = propsRef.current;
      const filterSet = p.clusterFilterIds && p.clusterFilterIds.length > 0
        ? new Set(p.clusterFilterIds) : null;
      const single = g.dataset.singleId;
      const idsStr = g.dataset.clusterIds;
      const dataId = g.dataset.id;
      if (single) { p.onClickListing(parseInt(single, 10)); return; }
      if (dataId) { p.onClickListing(parseInt(dataId, 10)); return; }
      if (idsStr) {
        const ids = idsStr.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        if (filterSet && filterSet.size === ids.length && ids.every((id) => filterSet.has(id))) {
          p.onClusterFilter?.(null, null);
        } else {
          p.onClusterFilter?.(ids, null);
        }
      }
    };
    svg.addEventListener('click', onSvgClick);

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
      if (rafId != null) cancelAnimationFrame(rafId);
      svgRef.current?.removeEventListener('click', onSvgClick);
      workerRef.current?.removeEventListener('message', onWorkerMessage);
      if (evt) {
        try { evt.removeListener(map, 'drag', scheduleRender); } catch { /* noop */ }
        try { evt.removeListener(map, 'zoom_changed', scheduleRender); } catch { /* noop */ }
        try { evt.removeListener(map, 'center_changed', scheduleRender); } catch { /* noop */ }
      }
      if (svg.parentNode) svg.parentNode.removeChild(svg);
      svgRef.current = null;
      markersGRef.current = null;
      clusterMapRef.current.clear();
      poolRef.current = [];
      try { workerRef.current?.terminate(); } catch { /* noop */ }
      workerRef.current = null;
    };
  }, [props.map, props.container]);  // ★ Wave 52: mount-only

  // listings 변경 = worker setListings + render() 만
  useEffect(() => {
    const w = workerRef.current;
    if (w) {
      try { w.postMessage({ type: 'setListings', listings: props.listings }); } catch { /* noop */ }
    }
    renderRef.current();
  }, [props.listings]);

  // category / filter 변경 = render() 만
  useEffect(() => {
    renderRef.current();
  }, [props.category, props.selectedListingId, props.clusterFilterIds, props.clusterFilterListings]);

  return null;
}
