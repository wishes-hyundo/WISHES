// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CanvasMarkerLayer.tsx — Wave 50 (2026-05-04 사장님 명령 "끝까지 무조건")
//
// Wave 49 측정 결과 50-112ms (SVG 보다 느림). 원인 추측 X — 직접 측정 + 배치 최적화.
//
// Wave 50 변경:
//   1. ★ Path2D 배치: 같은 색깔 cluster 의 모든 arc 를 single path 에 묶음 → 1 fill + 1 stroke (53번 → 4번)
//   2. ★ Text image cache: 0~999 텍스트 미리 OffscreenCanvas 에 렌더 → drawImage (fillText 5x 빠름)
//   3. ★ Font set 1회 (loop 밖, 가장 흔한 11px 우선)
//   4. ★ performance.mark 으로 각 단계 측정 → window.__canvasTrace 에 노출
//   5. Pan path (Wave 47): canvas.style.transform translate (그대로)
//
// 보존: I-MARKER-*, I-COORD-3, I-PERF-2
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

interface DrawnCluster {
  it: ClusterRenderItem;
  x: number;
  y: number;
}

// ──────────────────────────────────────────────────────
// Wave 50 #2: Text image cache (pre-rendered 숫자 → drawImage)
// ──────────────────────────────────────────────────────
const TEXT_CACHE = new Map<string, HTMLCanvasElement>();
function getTextCanvas(text: string, fontSize: number, dpr: number): HTMLCanvasElement {
  const key = `${text}_${fontSize}`;
  const cached = TEXT_CACHE.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  // 텍스트 크기 측정용 임시 ctx
  const tmpCtx = c.getContext('2d')!;
  tmpCtx.font = `bold ${fontSize}px sans-serif`;
  const m = tmpCtx.measureText(text);
  const w = Math.ceil(m.width) + 4;
  const h = fontSize + 4;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);
  TEXT_CACHE.set(key, c);
  return c;
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
  const dprRef = useRef<number>(1);
  const lastLevelRef = useRef<number>(-1);
  const anchorLatRef = useRef<number>(0);
  const anchorLngRef = useRef<number>(0);
  const anchorPxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!container || typeof window === 'undefined') return;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
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
          dprRef.current = dpr2;
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

  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    try { w.postMessage({ type: 'setListings', listings }); } catch { /* noop */ }
  }, [listings]);

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
    // Wave 50: Batch optimized commit (perf instrumented)
    // ────────────────────────────────────────────────
    const commitItems = (
      items: ClusterRenderItem[],
      anchorL: number, anchorN: number,
      projection: { pointFromCoords: (c: unknown) => { x: number; y: number } },
    ) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;
      const dpr = dprRef.current;
      const t0 = performance.now();

      // pan transform reset (zoom path)
      canvas.style.transform = '';

      const w = container.clientWidth;
      const h = container.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const t1 = performance.now();

      // ── Phase 1: project all + filter visible
      const visible: { it: ClusterRenderItem; x: number; y: number }[] = [];
      for (const it of items) {
        const ll = new maps.LatLng(it.lat, it.lng);
        const p = projection.pointFromCoords(ll);
        if (p.x < -50 || p.y < -50 || p.x > w + 50 || p.y > h + 50) continue;
        visible.push({ it, x: p.x, y: p.y });
      }
      const t2 = performance.now();

      // ── Phase 2: Batch arcs by background color (single path per color)
      const byColor = new Map<string, typeof visible>();
      for (const v of visible) {
        const arr = byColor.get(v.it.bg);
        if (arr) arr.push(v); else byColor.set(v.it.bg, [v]);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'white';
      for (const [bg, arr] of byColor) {
        ctx.fillStyle = bg;
        ctx.beginPath();
        for (const v of arr) {
          // CRITICAL: arc 사이 moveTo 로 sub-path 끊어서 stroke 가 connecting line 안 그리게
          ctx.moveTo(v.x + v.it.r, v.y);
          ctx.arc(v.x, v.y, v.it.r, 0, 2 * Math.PI);
        }
        ctx.fill();
        ctx.stroke();
      }
      const t3 = performance.now();

      // ── Phase 3: Text via cached image (drawImage > fillText)
      for (const v of visible) {
        const text = v.it.isSpiderFy ? '1' : String(v.it.count);
        const tc = getTextCanvas(text, v.it.fontSize, dpr);
        // tc is HiDPI scaled; we want its CSS size center-aligned at (x,y)
        const cw = parseFloat(tc.style.width);
        const ch = parseFloat(tc.style.height);
        ctx.drawImage(tc, v.x - cw / 2, v.y - ch / 2, cw, ch);
      }
      const t4 = performance.now();

      drawnRef.current = visible;

      if (anchorL !== 0 || anchorN !== 0) {
        anchorLatRef.current = anchorL;
        anchorLngRef.current = anchorN;
        const ap = projection.pointFromCoords(new maps.LatLng(anchorL, anchorN));
        anchorPxRef.current = { x: ap.x, y: ap.y };
      }
      const t5 = performance.now();

      // Wave 50: trace 노출 (Chrome MCP 로 읽기)
      const win = window as unknown as { __canvasTrace?: object[] };
      win.__canvasTrace = win.__canvasTrace || [];
      (win.__canvasTrace as object[]).push({
        ts: Math.round(t0),
        n: visible.length,
        clear: Math.round((t1 - t0) * 100) / 100,
        project: Math.round((t2 - t1) * 100) / 100,
        arcs: Math.round((t3 - t2) * 100) / 100,
        text: Math.round((t4 - t3) * 100) / 100,
        anchor: Math.round((t5 - t4) * 100) / 100,
        total: Math.round((t5 - t0) * 100) / 100,
      });
      // 최근 50개만 유지
      if ((win.__canvasTrace as object[]).length > 50) (win.__canvasTrace as object[]).shift();
    };

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

      // Pan path: same level → CSS transform translate (~0ms)
      if (lastLevelRef.current === level && drawnRef.current.length > 0) {
        const ll = new maps.LatLng(anchorLatRef.current, anchorLngRef.current);
        const p = projection.pointFromCoords(ll);
        const dx = p.x - anchorPxRef.current.x;
        const dy = p.y - anchorPxRef.current.y;
        canvas.style.transform = `translate(${dx}px, ${dy}px)`;
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

    const onCanvasClick = (e: MouseEvent) => {
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
      for (let i = drawn.length - 1; i >= 0; i--) {
        const d = drawn[i];
        const dx = x - d.x;
        const dy = y - d.y;
        if (dx * dx + dy * dy <= d.it.r * d.it.r) {
          e.stopPropagation();
          e.preventDefault();
          if (d.it.isSpiderFy) { onClickListing(d.it.spiderFyId); return; }
          if (d.it.singleId) { onClickListing(parseInt(d.it.singleId, 10)); return; }
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
    };
    canvasRef.current.addEventListener('click', onCanvasClick);

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
