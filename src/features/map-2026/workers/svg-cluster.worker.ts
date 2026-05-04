// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// svg-cluster.worker.ts — Wave 43 (2026-05-04)
//
// 목적: cluster aggregation + spider-fy + centroid + 카테고리 필터를 main thread
//   밖으로 (Web Worker) 옮겨 zoom freeze 95ms → ~20-30ms 까지 축소.
//
// 동작:
//   1. main thread: postMessage({type:'setListings', listings}) — listings 캐시
//   2. main thread: postMessage({type:'render', level, category, ...}) — 매 render
//   3. worker: aggregateClusters + applySpiderFy + computeClusterPosition + cross-residential
//      → ClusterRenderItem[] (lat, lng, count, bg, r, fontSize, ids, singleId, isSpiderFy)
//   4. main thread: receive → projection.pointFromCoords(lat,lng) per cluster → SVG string
//      → svg.innerHTML 1번 설정.
//
// 보존 INVARIANTs:
//   I-MARKER-1/2/3/4/5/6/7 (cluster 로직 100% 동일 — clusterAggregation.ts/markerTier.ts 재사용)
//   I-COORD-3 (raw lat/lng)
//   I-PERF-1 (rAF batching 보완 — Worker = 진짜 off-main)
//
// Worker 컨텍스트 주의:
//   - DOM API (window, document) 없음 → Kakao map / projection 접근 불가
//   - pixel 변환은 main thread 가 receive 후 수행
//   - Next.js 15 Webpack: new Worker(new URL('./svg-cluster.worker.ts', import.meta.url), { type: 'module' })
//     로 bundle. 일반 TypeScript import OK.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// <reference lib="webworker" />

import type { MapListing } from '@/features/map-2026/store';
import {
  aggregateClusters,
  applySpiderFy,
  computeClusterPosition,
} from '@/features/map-2026/lib/clusterAggregation';
import { listingCategoryOf } from '@/features/map-2026/lib/markerTier';

// ──────────────────────────────────────────────────────
// 색상 (SvgMarkerLayer 와 1:1 일치 — main 과 worker 양쪽 공유 X 라 직접 정의)
// ──────────────────────────────────────────────────────
const CAT_COLORS = {
  residence: { bg: 'rgba(0, 98, 65, 0.68)', text: '#ffffff' },
  retail_office: { bg: 'rgba(180, 83, 9, 0.68)', text: '#ffffff' },
  land: { bg: 'rgba(120, 53, 15, 0.68)', text: '#ffffff' },
  investment: { bg: 'rgba(126, 34, 206, 0.68)', text: '#ffffff' },
} as const;
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
// 메시지 타입
// ──────────────────────────────────────────────────────
export interface SetListingsMsg {
  type: 'setListings';
  listings: MapListing[];
}

export interface RenderMsg {
  type: 'render';
  reqId: number;
  level: number;
  category: 'residence' | 'retail_office' | 'land' | 'investment';
  clusterFilterIds: number[] | null;
  clusterFilterListings: MapListing[] | null;
  selectedListingId: number | null;
  isMobile: boolean;
}

export type IncomingMsg = SetListingsMsg | RenderMsg;

export interface ClusterRenderItem {
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

export interface RenderResultMsg {
  type: 'render-result';
  reqId: number;
  items: ClusterRenderItem[];
  anchorLat: number;
  anchorLng: number;
}

// ──────────────────────────────────────────────────────
// 캐시 (listings 한 번 보내면 재사용)
// ──────────────────────────────────────────────────────
let cachedListings: MapListing[] = [];

// ──────────────────────────────────────────────────────
// Render 로직 (SvgMarkerLayer.tsx 의 inline 로직과 100% 동일)
// ──────────────────────────────────────────────────────
function processRender(msg: RenderMsg): RenderResultMsg {
  const {
    reqId, level, category, clusterFilterIds, clusterFilterListings,
    selectedListingId, isMobile,
  } = msg;

  const filterSet = clusterFilterIds && clusterFilterIds.length > 0
    ? new Set(clusterFilterIds) : null;
  const visibleListings = clusterFilterListings && clusterFilterListings.length > 0
    ? clusterFilterListings
    : (filterSet ? cachedListings.filter((l) => filterSet.has(l.id)) : cachedListings);

  const isClusterFilterActive = !!filterSet
    || !!(clusterFilterListings && clusterFilterListings.length > 0);

  const filtered = (category === 'investment' || isClusterFilterActive)
    ? visibleListings
    : visibleListings.filter((l) => listingCategoryOf(l) === category);

  const items: ClusterRenderItem[] = [];
  let anchorLat = 0;
  let anchorLng = 0;
  let firstAnchorSet = false;

  if (filtered.length === 0) {
    return { type: 'render-result', reqId, items, anchorLat, anchorLng };
  }

  // Spider-fy 모드 (cluster 클릭 후)
  if (isClusterFilterActive && filtered.length > 1) {
    const sf = applySpiderFy(filtered);
    const sfSize = isMobile ? 22 : 26;
    const cat = CAT_COLORS[category];
    for (const _sf of sf) {
      const l = _sf.listing;
      const isSel = selectedListingId === l.id;
      const bg = isSel ? SEL_BG : cat.bg;
      const r = sfSize / 2;
      items.push({
        lat: _sf.displayLat, lng: _sf.displayLng,
        r, fontSize: 11, bg, count: 1,
        ids: '', singleId: '', isSpiderFy: true, spiderFyId: l.id,
      });
      if (!firstAnchorSet) {
        anchorLat = _sf.displayLat; anchorLng = _sf.displayLng;
        firstAnchorSet = true;
      }
    }
    return { type: 'render-result', reqId, items, anchorLat, anchorLng };
  }

  // 일반 cluster 모드
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
    const r = size / 2;
    const fontSize = count >= 100 ? 12 : 11;
    const ids = arr.map((l) => l.id).join(',');
    const singleId = count === 1 ? String(arr[0].id) : '';

    items.push({
      lat: _pos.lat, lng: _pos.lng,
      r, fontSize, bg, count, ids, singleId,
      isSpiderFy: false, spiderFyId: 0,
    });
    if (!firstAnchorSet) {
      anchorLat = _pos.lat; anchorLng = _pos.lng;
      firstAnchorSet = true;
    }
  }

  return { type: 'render-result', reqId, items, anchorLat, anchorLng };
}

// ──────────────────────────────────────────────────────
// Worker 메시지 핸들러
// ──────────────────────────────────────────────────────
self.addEventListener('message', (e: MessageEvent<IncomingMsg>) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'setListings') {
    cachedListings = msg.listings || [];
    return;
  }

  if (msg.type === 'render') {
    const result = processRender(msg);
    (self as unknown as { postMessage: (m: RenderResultMsg) => void }).postMessage(result);
    return;
  }
});

// TypeScript module 보장
export {};
