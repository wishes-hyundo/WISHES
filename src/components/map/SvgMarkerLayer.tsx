// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SvgMarkerLayer.tsx — Wave 64 (2026-05-04 사장님 명령 Apple 스타일 정밀)
//
// CEO 명령: "테두리 흰색이 있는데 이것 좀 없애고 애플 스타일로 좀 바꾸고
//   마커 사이즈 밸런스 좀 맞춰. 그리고 로그인 했을때는 줌 단계를 더 늘려줘야지"
//
// Wave 64 변경:
//   1. 흰색 stroke 제거 → SVG <filter> 기반 부드러운 drop shadow (Apple Maps 룩)
//   2. 마커 사이즈 밸런스 — count 1 vs 1k 차이 22→44 (2.0x) → 22→36 (1.6x)
//      더 작은 시각 진폭 = Apple Maps 의 절제된 시각 위계
//   3. 색 alpha 0.85 → 0.92 (Apple Maps 풍 살짝 진한 솔리드 톤)
//   4. 텍스트 font-weight 600 (700→600) — Apple SF Pro 의 Semibold 톤
//
// 보존: Wave 38~63 의 모든 최적화 + Wave 60 색상 + Wave 61 자동 merge
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

// Wave 64 (사장님 명령 2026-05-04 Apple 정밀): 더 진한 솔리드 톤 (0.85 → 0.92)
const CAT_COLORS = {
  residence: { bg: 'rgba(34, 119, 80, 0.92)', text: '#ffffff' },
  retail_office: { bg: 'rgba(196, 121, 47, 0.92)', text: '#ffffff' },
  land: { bg: 'rgba(140, 88, 50, 0.92)', text: '#ffffff' },
  investment: { bg: 'rgba(135, 75, 200, 0.92)', text: '#ffffff' },
};
// Wave 60: 큰 숫자 압축 표기 (Apple 스타일 — 1k+ 는 K 단위)
function formatClusterCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.round(n / 1000) + 'K';
}
const SEL_BG = 'rgba(220, 38, 38, 0.92)';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Wave 64 (사장님 명령 2026-05-04): 사이즈 밸런스 — 22→36 (1.6x) Apple 절제된 위계.
//   이전 22→44 (2.0x) 는 1 vs 1k 차이가 시각적으로 너무 컸음.
function markerSize(count: number, level: number, isMobile: boolean): number {
  let mult = 1;
  if (level <= 2) mult = 1.30;
  else if (level <= 3) mult = 1.15;
  else if (level <= 4) mult = 1.08;
  else if (level >= 12) mult = 0.88;
  let base = 22;
  if (count >= 1000) base = 36;
  else if (count >= 100) base = 32;
  else if (count >= 30) base = 28;
  else if (count >= 10) base = 26;
  else if (count >= 2) base = 24;
  if (isMobile) base = Math.round(base * 0.92);
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
  // Wave 64: drop shadow filter (Apple 스타일)
  g.setAttribute('filter', 'url(#markerShadow)');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('r', String(it.r));
  circle.setAttribute('fill', it.bg);
  // Wave 64: 흰색 stroke 제거 — Apple Maps 룩 (테두리 X, drop shadow 만)
  circle.setAttribute('style', 'pointer-events:auto;cursor:pointer');
  g.appendChild(circle);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('y', '4');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', String(it.fontSize));
  // Wave 64: SF Pro Semibold 톤 (700 → 600)
  text.setAttribute('font-weight', '600');
  text.setAttribute('fill', 'white');
  text.setAttribute('style', 'pointer-events:none;user-select:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",sans-serif');
  text.textContent = it.isSpiderFy ? '1' : formatClusterCount(it.count);
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
    const newCount = it.isSpiderFy ? '1' : formatClusterCount(it.count);
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

// Wave 61 (사장님 명령 2026-05-04): cluster 겹침 자동 merge.
function mergeOverlapping(
  items: ClusterRenderItem[],
  maps: KakaoNamespace['maps'],
  projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
): ClusterRenderItem[] {
  if (!maps || items.length < 2) return items;
  type Pos = { it: ClusterRenderItem; x: number; y: number; alive: boolean };
  const pos: Pos[] = items.map((it) => {
    const ll = new maps.LatLng(it.lat, it.lng);
    const p = projection.pointFromCoords(ll);
    return { it, x: p.x, y: p.y, alive: true };
  });
  for (let i = 0; i < pos.length; i++) {
    if (!pos[i].alive) continue;
    for (let j = i + 1; j < pos.length; j++) {
      if (!pos[j].alive) continue;
      if (pos[i].it.isSpiderFy || pos[j].it.isSpiderFy) continue;
      const dx = pos[i].x - pos[j].x;
      const dy = pos[i].y - pos[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = pos[i].it.r + pos[j].it.r + 4;
      if (dist < minDist) {
        const big = pos[i].it.count >= pos[j].it.count ? pos[i] : pos[j];
        const small = pos[i].it.count >= pos[j].it.count ? pos[j] : pos[i];
        big.it = {
          ...big.it,
          count: big.it.count + small.it.count,
          ids: big.it.ids && small.it.ids ? big.it.ids + ',' + small.it.ids : big.it.ids || small.it.ids,
          singleId: '',
        };
        small.alive = false;
      }
    }
  }
  return pos.filter((p) => p.alive).map((p) => p.it);
}


function svgDiagPush(phase: string, dur: number, n?: number) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __svgDiag?: object[] };
  w.__svgDiag = w.__svgDiag || [];
  (w.__svgDiag as object[]).push({ phase, dur: Math.round(dur * 100) / 100, n: n ?? -1, ts: Math.round(performance.now()) });
  if ((w.__svgDiag as object[]).length > 200) (w.__svgDiag as object[]).shift();
}

export default function SvgMarkerLayer(props: SvgMarkerLayerProps) {
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

    // Wave 64 (사장님 명령 2026-05-04 Apple 스타일): drop shadow filter <defs>.
    //   feDropShadow dx=0 dy=1 stdDeviation=1.5 flood-opacity=0.30
    //   = Apple Maps 의 부드럽고 살짝 떠 보이는 그림자 톤.
    const defs = document.createElementNS(SVG_NS, 'defs');
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'markerShadow');
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');
    const feDrop = document.createElementNS(SVG_NS, 'feDropShadow');
    feDrop.setAttribute('dx', '0');
    feDrop.setAttribute('dy', '1');
    feDrop.setAttribute('stdDeviation', '1.5');
    feDrop.setAttribute('flood-color', '#000000');
    feDrop.setAttribute('flood-opacity', '0.30');
    filter.appendChild(feDrop);
    defs.appendChild(filter);
    svg.appendChild(defs);

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
      itemsRaw: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const _tC0 = performance.now();
      const mg = markersGRef.current;
      if (!mg) return;
      mg.setAttribute('transform', '');

      const items = mergeOverlapping(itemsRaw, maps, projection);

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
          // Wave 64: pool 에서 가져온 g 도 filter 적용 보장
          if (g.getAttribute('filter') !== 'url(#markerShadow)') {
            g.setAttribute('filter', 'url(#markerShadow)');
          }
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
      svgDiagPush('commit', performance.now() - _tC0, items.length);
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
      const _tM0 = performance.now();
      const data = e.data;
      if (!data || data.type !== 'render-result') return;
      if (data.reqId !== reqIdRef.current) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      commitItems(data.items, data.anchorLat, data.anchorLng, projection);
      svgDiagPush('worker_msg_handler', performance.now() - _tM0);
    };
    workerRef.current?.addEventListener('message', onWorkerMessage);

    const render = () => {
      const _t0 = performance.now();
      const sv = svgRef.current;
      const mg = markersGRef.current;
      if (!sv || !mg) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;
      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const p = propsRef.current;

      if (lastLevelRef.current === level && clusterMapRef.current.size > 0) {
        const ll = new maps.LatLng(anchorLatRef.current, anchorLngRef.current);
        const pp = projection.pointFromCoords(ll);
        const dx = pp.x - anchorPxRef.current.x;
        const dy = pp.y - anchorPxRef.current.y;
        mg.setAttribute('transform', `translate(${dx},${dy})`);
        svgDiagPush('pan', performance.now() - _t0);
        return;
      }
      lastLevelRef.current = level;
      const _tAfterPanCheck = performance.now();
      svgDiagPush('zoom_path_setup', _tAfterPanCheck - _t0);

      if (workerRef.current) {
        reqIdRef.current += 1;
        const _tPost0 = performance.now();
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
          svgDiagPush('worker_postMessage', performance.now() - _tPost0);
        } catch {
          syncRender();
        }
      } else {
        syncRender();
      }
      svgDiagPush('render_total', performance.now() - _t0);
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
    let _scheduleCount = 0;
    const scheduleRender = () => {
      _scheduleCount++;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => { rafId = null; svgDiagPush('rafId_count_since_last', _scheduleCount); _scheduleCount = 0; render(); });
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
  }, [props.map, props.container]);

  useEffect(() => {
    const w = workerRef.current;
    if (w) {
      try { w.postMessage({ type: 'setListings', listings: props.listings }); } catch { /* noop */ }
    }
    // Wave 65 (사장님 명령 2026-05-04): listings 갱신 시 pan path 우회 — CRITICAL FIX.
    //   진단: 사장님 "지도 옮기면 마커 화면에 고정". 원인:
    //     useEffect[listings] → renderRef.current() → render() → 같은 level →
    //     pan path 만 실행 → worker render 호출 X → 새 listings 가 commitItems
    //     안 거쳐서 markers redraw 안 됨. 옛 markers 만 화면에 남고 transform
    //     으로만 이동 = stuck 보임.
    //   fix: lastLevelRef -1 으로 invalidate → render() 가 zoom 경로로 →
    //     worker 호출 → 응답 시 commitItems → 새 markers 정확 commit.
    //   I-PERF-3 영구 INVARIANT 후보.
    lastLevelRef.current = -1;
    renderRef.current();
  }, [props.listings]);

  useEffect(() => {
    // Wave 65: category/filter 변경도 commit 필요 — pan path 우회.
    lastLevelRef.current = -1;
    renderRef.current();
  }, [props.category, props.selectedListingId, props.clusterFilterIds, props.clusterFilterListings]);

  return null;
}
