'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wave 79 (사장님 명령 2026-05-06): KakaoMarkerLayer
//
// 배경: SvgMarkerLayer (custom SVG + transform 추적) → panning 시 마커 stuck.
//   useEffect[serverClusters] cycle 가 transform reset 반복 → 사용자 시각 마커 고정.
//
// 사장님 결정: 5 업체 (직방/다방/네모/피터팬) 와 같은 architecture.
//   = Kakao native CustomOverlay (SDK 가 자동 reposition).
//   transform 추적 코드 0. SDK 가 panning/zoom 시 매 frame 자동 갱신.
//
// 작동:
//   1. props.serverClusters 받음 (Wave 78a SQL 격자 제거 + tier1 좌표 + cluster_token)
//   2. 각 cluster 마다 1 kakao.maps.CustomOverlay 생성
//   3. cluster_id 기반 pool reuse (같은 id = setPosition + setContent 만 update)
//   4. 사라진 cluster_id = setMap(null) + pool 제거
//   5. click handler: content div delegation → onClickListing / onClusterFilter
//
// I-MARKER-3 (TIER1): tier1_lat 우선 사용 (building_centroids 정확 좌표)
// I-COORD-3: raw lat/lng 그대로 (마스킹 X)
// I-PERF-1: pool reuse 로 setMap 호출 최소화 (같은 cluster 면 setMap 호출 X)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef } from 'react';
import type { MapListing } from '@/features/map-2026/store';

interface KakaoLatLng { /* opaque */ }
interface KakaoCustomOverlay {
  setMap: (m: unknown) => void;
  setPosition: (p: KakaoLatLng) => void;
  setContent: (html: string | HTMLElement) => void;
  getMap?: () => unknown;
}
interface KakaoMaps {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
}
interface KakaoNamespace {
  maps: KakaoMaps;
}

export interface ServerClusterInput {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  cluster_token?: string | null;
  building_name?: string | null;
  tier1_lat?: number | null;
  tier1_lng?: number | null;
  sample_ids?: number[] | null;
}

export interface KakaoMarkerLayerProps {
  map: unknown;
  container: HTMLElement | null;
  listings: MapListing[];
  selectedListingId: number | null;
  category: 'residence' | 'retail_office' | 'land' | 'investment';
  clusterFilterIds: number[] | null;
  clusterFilterListings: MapListing[] | null;
  onClickListing: (id: number) => void;
  onClusterFilter?: (ids: number[] | null, label?: string | null) => void;
  serverClusters?: ServerClusterInput[] | null;
}

const CAT_COLORS = {
  residence: 'rgba(34, 119, 80, 0.85)',
  retail_office: 'rgba(196, 121, 47, 0.85)',
  land: 'rgba(140, 88, 50, 0.85)',
  investment: 'rgba(135, 75, 200, 0.85)',
} as const;
const SEL_BG = 'rgba(220, 38, 38, 0.85)';

function markerSize(count: number): number {
  if (count >= 1000) return 44;
  if (count >= 100) return 36;
  if (count >= 30) return 30;
  if (count >= 10) return 26;
  return 22;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

function makeContentHtml(it: { count: number; bg: string; ids: string; singleId: string; }): string {
  const sz = markerSize(it.count);
  const fontSize = it.count >= 100 ? 12 : 11;
  const dataAttr = it.singleId
    ? `data-single-id="${it.singleId}"`
    : `data-cluster-ids="${it.ids}"`;
  return `<div class="wishes-marker" ${dataAttr} style="`
    + `display:flex;align-items:center;justify-content:center;`
    + `width:${sz}px;height:${sz}px;background:${it.bg};`
    + `border-radius:50%;color:#fff;font-weight:700;`
    + `font-size:${fontSize}px;cursor:pointer;`
    + `box-shadow:0 2px 6px rgba(0,0,0,0.3);`
    + `user-select:none;-webkit-tap-highlight-color:transparent;`
    + `font-family:-apple-system,BlinkMacSystemFont,sans-serif;`
    + `pointer-events:auto;`
    + `">${formatCount(it.count)}</div>`;
}

export default function KakaoMarkerLayer(props: KakaoMarkerLayerProps) {
  const overlayPoolRef = useRef<Map<string, KakaoCustomOverlay>>(new Map());
  const propsRef = useRef(props);
  propsRef.current = props;

  // sync overlays to serverClusters
  useEffect(() => {
    if (!props.map) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const maps = win.kakao?.maps;
    if (!maps) return;

    const pool = overlayPoolRef.current;
    const seen = new Set<string>();
    const isClusterFilterActive = !!(props.clusterFilterIds && props.clusterFilterIds.length > 0);

    // serverClusters path (no cluster filter active)
    if (props.serverClusters && props.serverClusters.length > 0 && !isClusterFilterActive) {
      const cat = CAT_COLORS[props.category];
      for (const sc of props.serverClusters) {
        const lat = (typeof sc.tier1_lat === 'number' && Number.isFinite(sc.tier1_lat)) ? sc.tier1_lat : sc.lat;
        const lng = (typeof sc.tier1_lng === 'number' && Number.isFinite(sc.tier1_lng)) ? sc.tier1_lng : sc.lng;
        const ids = (sc.sample_ids ?? []).join(',');
        const singleId = sc.count === 1 && sc.sample_ids?.[0] ? String(sc.sample_ids[0]) : '';
        const hasSel = props.selectedListingId != null && (sc.sample_ids ?? []).includes(props.selectedListingId);
        const bg = hasSel ? SEL_BG : cat;
        const html = makeContentHtml({ count: sc.count, bg, ids, singleId });

        const key = sc.cluster_id;
        seen.add(key);

        const existing = pool.get(key);
        if (existing) {
          // reuse: position + content update only
          existing.setPosition(new maps.LatLng(lat, lng));
          existing.setContent(html);
        } else {
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(lat, lng),
            content: html,
            yAnchor: 0.5,
            xAnchor: 0.5,
            zIndex: 100,
          });
          ov.setMap(props.map);
          pool.set(key, ov);
        }
      }
    } else if (isClusterFilterActive && props.clusterFilterListings) {
      // cluster filter: spider-fy each listing in filter
      const cat = CAT_COLORS[props.category];
      const list = props.clusterFilterListings.length > 0
        ? props.clusterFilterListings
        : props.listings.filter((l) => props.clusterFilterIds!.includes(l.id));
      for (const l of list) {
        const key = `f_${l.id}`;
        seen.add(key);
        const isSel = props.selectedListingId === l.id;
        const bg = isSel ? SEL_BG : cat;
        const html = makeContentHtml({ count: 1, bg, ids: '', singleId: String(l.id) });
        const existing = pool.get(key);
        if (existing) {
          existing.setPosition(new maps.LatLng(l.lat, l.lng));
          existing.setContent(html);
        } else {
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(l.lat, l.lng),
            content: html,
            yAnchor: 0.5,
            xAnchor: 0.5,
            zIndex: 110,
          });
          ov.setMap(props.map);
          pool.set(key, ov);
        }
      }
    }

    // remove unseen overlays
    for (const [key, ov] of pool.entries()) {
      if (!seen.has(key)) {
        try { ov.setMap(null); } catch { /* noop */ }
        pool.delete(key);
      }
    }
  }, [props.serverClusters, props.map, props.category, props.selectedListingId, props.clusterFilterIds, props.clusterFilterListings, props.listings]);

  // Click handler via document delegation
  useEffect(() => {
    if (!props.map) return;
    const handler = (e: Event) => {
      const target = (e.target as Element).closest('.wishes-marker') as HTMLElement | null;
      if (!target) return;
      e.stopPropagation();
      const single = target.dataset.singleId;
      const idsStr = target.dataset.clusterIds;
      const p = propsRef.current;
      if (single) {
        p.onClickListing(parseInt(single, 10));
        return;
      }
      if (idsStr) {
        const ids = idsStr.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        if (ids.length === 1) {
          p.onClickListing(ids[0]);
        } else if (ids.length > 1) {
          p.onClusterFilter?.(ids, null);
        }
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [props.map]);

  // Cleanup all overlays on unmount
  useEffect(() => {
    return () => {
      const pool = overlayPoolRef.current;
      for (const ov of pool.values()) {
        try { ov.setMap(null); } catch { /* noop */ }
      }
      pool.clear();
    };
  }, []);

  return null;
}
