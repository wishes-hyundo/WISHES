'use client';

// Wave 79 + 87 + 91: KakaoMarkerLayer (Apple style safe)
//   Wave 79: kakao.maps.CustomOverlay native (5-site arch)
//   Wave 87: tier1_lat sanity check (~500m drift skip)
//   Wave 91: Apple style via injected stylesheet (no inline transition/will-change)

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
  residence: 'rgba(34, 119, 80, 0.92)',
  retail_office: 'rgba(196, 121, 47, 0.92)',
  land: 'rgba(140, 88, 50, 0.92)',
  investment: 'rgba(135, 75, 200, 0.92)',
} as const;
const SEL_BG = 'rgba(220, 38, 38, 0.92)';

function markerSize(count: number): number {
  if (count >= 1000) return 70;
  if (count >= 500) return 64;
  if (count >= 100) return 56;
  if (count >= 30) return 48;
  if (count >= 10) return 42;
  if (count >= 5) return 36;
  if (count >= 2) return 32;
  return 28;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) {
    const v = (n / 1000).toFixed(1);
    return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
  }
  return Math.floor(n / 1000) + 'K';
}

const APPLE_STYLE_ID = 'wishes-marker-apple-style';
const APPLE_STYLE_CSS = ".wishes-marker{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:600;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif;letter-spacing:-0.01em;border:1.5px solid rgba(255,255,255,0.92);box-shadow:0 1px 2px rgba(0,0,0,0.12),0 4px 12px rgba(0,0,0,0.18);transition:transform 180ms cubic-bezier(0.16,1,0.3,1),box-shadow 180ms ease-out;transform:translateZ(0);}.wishes-marker:hover{transform:scale(1.08) translateZ(0);box-shadow:0 2px 4px rgba(0,0,0,0.16),0 8px 20px rgba(0,0,0,0.22);z-index:200;}";

function injectAppleStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(APPLE_STYLE_ID)) return;
  const styleEl = document.createElement('style');
  styleEl.id = APPLE_STYLE_ID;
  styleEl.textContent = APPLE_STYLE_CSS;
  document.head.appendChild(styleEl);
}

function makeContentHtml(it: { count: number; bg: string; ids: string; singleId: string; }): string {
  const sz = markerSize(it.count);
  const fontSize = it.count >= 100 ? 12 : 11;
  const dataAttr = it.singleId
    ? `data-single-id="${it.singleId}"`
    : `data-cluster-ids="${it.ids}"`;
  return `<div class="wishes-marker" ${dataAttr} style="width:${sz}px;height:${sz}px;background:${it.bg};font-size:${fontSize}px;">${formatCount(it.count)}</div>`;
}

export default function KakaoMarkerLayer(props: KakaoMarkerLayerProps) {
  const overlayPoolRef = useRef<Map<string, KakaoCustomOverlay>>(new Map());
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    injectAppleStyle();
  }, []);

  useEffect(() => {
    if (!props.map) return;
    const win = window as unknown as { kakao?: KakaoNamespace };
    const maps = win.kakao?.maps;
    if (!maps) return;

    const pool = overlayPoolRef.current;
    const seen = new Set<string>();
    const isClusterFilterActive = !!(props.clusterFilterIds && props.clusterFilterIds.length > 0);

    if (props.serverClusters && props.serverClusters.length > 0 && !isClusterFilterActive) {
      const cat = CAT_COLORS[props.category];
      for (const sc of props.serverClusters) {
        const t1Lat = (typeof sc.tier1_lat === 'number' && Number.isFinite(sc.tier1_lat)) ? sc.tier1_lat : null;
        const t1Lng = (typeof sc.tier1_lng === 'number' && Number.isFinite(sc.tier1_lng)) ? sc.tier1_lng : null;
        const tier1Valid = t1Lat != null && t1Lng != null
          && Math.abs(t1Lat - sc.lat) < 0.005
          && Math.abs(t1Lng - sc.lng) < 0.005;
        const lat = tier1Valid ? t1Lat! : sc.lat;
        const lng = tier1Valid ? t1Lng! : sc.lng;
        const ids = (sc.sample_ids ?? []).join(',');
        const singleId = sc.count === 1 && sc.sample_ids?.[0] ? String(sc.sample_ids[0]) : '';
        const hasSel = props.selectedListingId != null && (sc.sample_ids ?? []).includes(props.selectedListingId);
        const bg = hasSel ? SEL_BG : cat;
        const html = makeContentHtml({ count: sc.count, bg, ids, singleId });

        const key = sc.cluster_id;
        seen.add(key);

        const existing = pool.get(key);
        if (existing) {
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

    for (const [key, ov] of pool.entries()) {
      if (!seen.has(key)) {
        try { ov.setMap(null); } catch { /* noop */ }
        pool.delete(key);
      }
    }
  }, [props.serverClusters, props.map, props.category, props.selectedListingId, props.clusterFilterIds, props.clusterFilterListings, props.listings]);

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
