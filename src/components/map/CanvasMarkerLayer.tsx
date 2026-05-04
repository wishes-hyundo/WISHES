// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CanvasMarkerLayer.tsx — Wave 49 (2026-05-04 사장님 명령 "끝까지 무조건")
//
// SvgMarkerLayer 의 50ms 한계 도달 (SVG DOM reflow 자체).
// Canvas 2D 로 전환 — 53 cluster = arc + fillText = ~3-5ms (DOM 무관).
//
// 동작:
//   1. <canvas> overlay (HiDPI scaled) on Kakao map container
//   2. Worker (svg-cluster.worker.ts 그대로) → ClusterRenderItem[]
//   3. Main thread: ctx.clearRect + 53 arc + 53 fillText (단일 frame ~5ms)
//   4. Pan: canvas.style.transform translate (Wave 42 패턴, no redraw)
//   5. Click: canvas hit test (distance check, iterate reverse for top-first)
//
// 위험 관리:
//   - SvgMarkerLayer 그대로 보존 (?canvas=1 없으면 SVG 사용)
//   - ?canvas=0 = SVG 강제 (이중 안전망)
//   - Wave 50 에서 검증 후 default
//
// 보존 INVARIANTs:
//   I-MARKER-1/2/3/4/5/6/7 (worker 가 처리)
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

export interface CanvasMarkerLayerProps {
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
// Hit test 위해 마지막 render 의 cluster pixel 위치 보관
// ──────────────────────────────────────────────────────
interface DrawnCluster {
  it: ClusterRenderItem;
  x: number;
  y: number;
}

export default function CanvasMarkerLayer({
  map,
  container,
  listings,
  selectedListingId,
  category,
  clusterFilterIds,
  clusterFilterListings,
  onClickListing,
  onClusterFilter,
}: CanvasMarkerLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawnRef = useRef<DrawnCluster[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(0);
  // Pan anchor (Wave 42 mechanism via canvas.style.transform)
  const lastLevelRef = useRef<number>(-1);
  const anchorLatRef = useRef<number>(0);
  const anchorLngRef = useRef<number>(0);
  const anchorPxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ──────────────────────────────────────────────────────
  // Mount canvas + worker
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!container || typeof window === 'undefined') return;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'pointer';
    canvas.style.zIndex = '6';
    canvas.style.transformOrigin = '0 0';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctxRef.current = ctx;
    }

    // Worker boot
    try {
      if (typeof Worker !== 'undefined') {
        const wkr = new Worker(
          new URL('../../features/map-2026/workers/svg-cluster.worker.ts', import.meta.url),
          { type: 'module' },
        );
        workerRef.current = wkr;
      }
    } catch {
      workerRef.current = null;
    }

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const c = canvasRef.current;
          if (!c) return;
          const dpr2 = window.devicePixelRatio || 1;
          const w2 = container.clientWidth;
          const h2 = container.clientHeight;
          c.width = Math.round(w2 * dpr2);
          c.height = Math.round(h2 * dpr2);
          const ctx2 = c.getContext('2d');
          if (ctx2) {
            ctx2.scale(dpr2, dpr2);
            ctxRef.current = ctx2;
          }
        })
      : null;
    ro?.observe(container);

    return () => {
      ro?.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
      ctxRef.current = null;
      drawnRef.current = [];
      try { workerRef.current?.terminate(); } catch { /* noop */ }
      workerRef.current = null;
    };
  }, [container]);

  // Worker 에 listings sync
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    try { w.postMessage({ type: 'setListings', listings }); } catch { /* noop */ }
  }, [listings]);

  // ──────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !container || !canvasRef.current || !ctxRef.current) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const kakao = win.kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const filterSet = clusterFilterIds && clusterFilterIds.length > 0
      ? new Set(clusterFilterIds) : null;

    // ────────────────────────────────────────────────
    // commit: ClusterRenderItem[] → canvas 2D draw
    // ────────────────────────────────────────────────
    const commitItems = (
      items: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      // Wave 42 reset: zoom path 시 transform 초기화
      canvas.style.transform = '';

      const w = container.clientWidth;
      const h = container.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const drawn: DrawnCluster[] = [];

      for (const it of items) {
        const ll = new maps.LatLng(it.lat, it.lng);
        const p = projection.pointFromCoords(ll);
        // 화면 밖 마커는 skip (clipping)
        if (p.x < -50 || p.y < -50 || p.x > w + 50 || p.y > h + 50) continue;

        // Circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, it.r, 0, 2 * Math.PI);
        ctx.fillStyle = it.bg;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${it.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.isSpiderFy ? '1' : String(it.count), p.x, p.y);

        drawn.push({ it, x: p.x, y: p.y });
      }
      drawnRef.current = drawn;

      // anchor 저장 (pan delta 계산)
      if (anchorL !== 0 || anchorN !== 0) {
        anchorLatRef.current = anchorL;
        anchorLngRef.current = anchorN;
        const ap = projection.pointFromCoords(new maps.LatLng(anchorL, anchorN));
        anchorPxRef.current = { x: ap.x, y: ap.y };
      }
    };

    // Sync fallback (worker 부팅 실패 시)
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

    // Worker response handler
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
      const canvas = canvasRef.current;
      if (!canvas) return;
      const projection = mapInst.getProjection?.();
      if (!projection) return;

      const level = mapInst.getLevel?.() ?? 5;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      // Pan path: 같은 level → canvas CSS transform translate (no redraw, ~0ms)
      if (lastLevelRef.current === level && drawnRef.current.length > 0) {
        const ll = new maps.LatLng(anchorLatRef.current, anchorLngRef.current);
        const p = projection.pointFromCoords(ll);
        const dx = p.x - anchorPxRef.current.x;
        const dy = p.y - anchorPxRef.current.y;
        canvas.style.transform = `translate(${dx}px, ${dy}px)`;
        return;
      }
      lastLevelRef.current = level;

      // Zoom path: full redraw via worker
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

    // ────────────────────────────────────────────────
    // Click hit test (canvas 는 child 가 없어서 직접 distance check)
    // ────────────────────────────────────────────────
    const onCanvasClick = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // canvas.style.transform 의 영향 빼고 viewport 좌표만 계산
      const cssTransform = canvas.style.transform;
      let tx = 0, ty = 0;
      if (cssTransform) {
        const m = cssTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
      }
      const x = e.clientX - rect.left - tx;
      const y = e.clientY - rect.top - ty;

      // 마지막 마커가 위에 그려졌으니 reverse 로 hit test
      const drawn = drawnRef.current;
      for (let i = drawn.length - 1; i >= 0; i--) {
        const d = drawn[i];
        const dx = x - d.x;
        const dy = y - d.y;
        if (dx * dx + dy * dy <= d.it.r * d.it.r) {
          // hit
          e.stopPropagation();
          e.preventDefault();
          if (d.it.isSpiderFy) {
            onClickListing(d.it.spiderFyId);
            return;
          }
          if (d.it.singleId) {
            onClickListing(parseInt(d.it.singleId, 10));
            return;
          }
          if (d.it.ids) {
            const ids = d.it.ids.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
            if (filterSet && filterSet.size === ids.length && ids.every((id) => filterSet.has(id))) {
              onClusterFilter?.(null, null);
            } else {
              onClusterFilter?.(ids, null);
            }
          }
          return;
        }
      }
      // miss → 이벤트 통과 (Kakao map 으로)
    };
    canvasRef.current.addEventListener('click', onCanvasClick);

    // pointer-events 동적 토글 — pan 시 지도가 받게
    const onCanvasMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssTransform = canvas.style.transform;
      let tx = 0, ty = 0;
      if (cssTransform) {
        const m = cssTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
      }
      const x = e.clientX - rect.left - tx;
      const y = e.clientY - rect.top - ty;
      const drawn = drawnRef.current;
      let hit = false;
      for (let i = drawn.length - 1; i >= 0; i--) {
        const d = drawn[i];
        const dx = x - d.x;
        const dy = y - d.y;
        if (dx * dx + dy * dy <= d.it.r * d.it.r) { hit = true; break; }
      }
      canvas.style.pointerEvents = hit ? 'auto' : 'none';
    };
    container.addEventListener('mousemove', onCanvasMouseMove, { passive: true });

    // Pan/zoom listeners
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
      canvasRef.current?.removeEventListener('click', onCanvasClick);
      container.removeEventListener('mousemove', onCanvasMouseMove);
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
