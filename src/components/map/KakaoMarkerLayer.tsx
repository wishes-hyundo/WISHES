'use client';

// Wave 79 + 87 + 91 + 96: KakaoMarkerLayer
//   Wave 79: kakao.maps.CustomOverlay native (5-site arch)
//   Wave 87: tier1_lat sanity check
//   Wave 91: Apple style via injected stylesheet
//   Wave 96: cluster-filter spider-fy radial spread (I-MARKER-6 fix)

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
const APPLE_STYLE_CSS = ".wishes-marker{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:600;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif;letter-spacing:-0.01em;box-shadow:0 1px 2px rgba(0,0,0,0.12),0 4px 12px rgba(0,0,0,0.18);transition:transform 180ms cubic-bezier(0.16,1,0.3,1),box-shadow 180ms ease-out;transform:translateZ(0);}.wishes-marker:hover{transform:scale(1.08) translateZ(0);box-shadow:0 2px 4px rgba(0,0,0,0.16),0 8px 20px rgba(0,0,0,0.22);z-index:200;}";

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

// Wave 96: spider-fy radial spread for cluster filter (I-MARKER-6)
//   같은 좌표 매물들을 12시 방향 N등분 원형으로 분산
function spiderfyPositions(list: MapListing[], radiusDeg: number): Array<{ id: number; lat: number; lng: number }> {
  const groups = new Map<string, MapListing[]>();
  for (const l of list) {
    const k = `${l.lat.toFixed(4)}:${l.lng.toFixed(4)}`;
    const arr = groups.get(k) || [];
    arr.push(l);
    groups.set(k, arr);
  }
  const result: Array<{ id: number; lat: number; lng: number }> = [];
  for (const members of groups.values()) {
    const N = members.length;
    if (N === 1) {
      result.push({ id: members[0].id, lat: members[0].lat, lng: members[0].lng });
    } else {
      const cosLat = Math.cos(members[0].lat * Math.PI / 180) || 1;
      members.forEach((l, idx) => {
        const angle = (idx * 2 * Math.PI / N) - Math.PI / 2;
        const dLat = radiusDeg * Math.sin(-angle);
        const dLng = (radiusDeg / cosLat) * Math.cos(angle);
        result.push({ id: l.id, lat: l.lat + dLat, lng: l.lng + dLng });
      });
    }
  }
  return result;
}

// Kakao map projection 타입 (간단)
interface KakaoMapLike {
  getProjection?: () => { pointFromCoords: (c: unknown) => { x: number; y: number } };
}

// [Step 100 fix 2026-05-19 사장님 명령] D-6 cluster merge — 가까운 작은 cluster 합치기
//   사장님 보고: 1-2개 cluster 가 화면을 가득 채움 (시각 noise)
//   해결: 픽셀 거리 40px 이내 cluster 끼리 client-side merge.
//   SvgMarkerLayer:193-228 의 mergeOverlapping 로직 차용 (Kakao Map projection 사용).
type ServerClusterMerged = {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  sample_ids: number[];
  tier1_lat: number | null;
  tier1_lng: number | null;
};
function mergeKakaoOverlapping(
  clusters: ServerClusterInput[],
  maps: KakaoNamespace['maps'],
  map: KakaoMapLike,
): ServerClusterMerged[] {
  if (!maps || !map || clusters.length < 2) {
    return clusters.map((c) => ({
      cluster_id: c.cluster_id,
      lat: c.lat, lng: c.lng, count: c.count,
      sample_ids: c.sample_ids ?? [],
      tier1_lat: typeof c.tier1_lat === 'number' ? c.tier1_lat : null,
      tier1_lng: typeof c.tier1_lng === 'number' ? c.tier1_lng : null,
    }));
  }
  const projection = (map as { getProjection?: () => { pointFromCoords: (c: unknown) => { x: number; y: number } } }).getProjection?.();
  if (!projection) {
    return clusters.map((c) => ({
      cluster_id: c.cluster_id,
      lat: c.lat, lng: c.lng, count: c.count,
      sample_ids: c.sample_ids ?? [],
      tier1_lat: typeof c.tier1_lat === 'number' ? c.tier1_lat : null,
      tier1_lng: typeof c.tier1_lng === 'number' ? c.tier1_lng : null,
    }));
  }
  type Pos = {
    it: ServerClusterMerged;
    x: number; y: number;
    alive: boolean;
  };
  const pos: Pos[] = clusters.map((c) => {
    const ll = new maps.LatLng(c.lat, c.lng);
    const p = projection.pointFromCoords(ll as unknown);
    const t1Lat = typeof c.tier1_lat === 'number' && Number.isFinite(c.tier1_lat) ? c.tier1_lat : null;
    const t1Lng = typeof c.tier1_lng === 'number' && Number.isFinite(c.tier1_lng) ? c.tier1_lng : null;
    return {
      it: {
        cluster_id: c.cluster_id,
        lat: c.lat, lng: c.lng, count: c.count,
        sample_ids: c.sample_ids ?? [],
        tier1_lat: t1Lat,
        tier1_lng: t1Lng,
      },
      x: p.x, y: p.y,
      alive: true,
    };
  });
  // 40px 이내 merge (count 큰 쪽 흡수)
  const MERGE_DIST_PX = 40;
  for (let i = 0; i < pos.length; i++) {
    if (!pos[i].alive) continue;
    for (let j = i + 1; j < pos.length; j++) {
      if (!pos[j].alive) continue;
      const dx = pos[i].x - pos[j].x;
      const dy = pos[i].y - pos[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MERGE_DIST_PX) {
        const big = pos[i].it.count >= pos[j].it.count ? pos[i] : pos[j];
        const small = pos[i].it.count >= pos[j].it.count ? pos[j] : pos[i];
        big.it = {
          ...big.it,
          count: big.it.count + small.it.count,
          // [Step 109 fix 2026-05-19] sample_ids cap 20 — side panel 폭주 차단
          sample_ids: [...big.it.sample_ids, ...small.it.sample_ids].slice(0, 20),
          // cluster_id 도 짧게 (첫 4글자만 + count) — pool key 안정
          cluster_id: big.it.cluster_id.slice(0, 8) + '_m' + (big.it.count + small.it.count),
        };
        small.alive = false;
      }
    }
  }
  return pos.filter((p) => p.alive).map((p) => p.it);
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
      // [Step 100 fix] 작은 cluster 40px 이내 merge → 노이즈 감소
      const mergedClusters = mergeKakaoOverlapping(props.serverClusters, maps, props.map as KakaoMapLike);
      for (const sc of mergedClusters) {
        const t1Lat = sc.tier1_lat;
        const t1Lng = sc.tier1_lng;
        const tier1Valid = t1Lat != null && t1Lng != null
          && Math.abs(t1Lat - sc.lat) < 0.005
          && Math.abs(t1Lng - sc.lng) < 0.005;
        const lat = tier1Valid ? t1Lat! : sc.lat;
        const lng = tier1Valid ? t1Lng! : sc.lng;
        const ids = sc.sample_ids.join(',');
        const singleId = sc.count === 1 && sc.sample_ids[0] ? String(sc.sample_ids[0]) : '';
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
      // Wave 96: spider-fy 적용 (I-MARKER-6)
      const cat = CAT_COLORS[props.category];
      const list = props.clusterFilterListings.length > 0
        ? props.clusterFilterListings
        : props.listings.filter((l) => props.clusterFilterIds!.includes(l.id));
      const SPIDER_RADIUS_DEG = 0.0005; // ~55m
      const positioned = spiderfyPositions(list, SPIDER_RADIUS_DEG);
      const listMap = new Map(list.map((l) => [l.id, l] as const));
      for (const p of positioned) {
        const l = listMap.get(p.id);
        if (!l) continue;
        const key = `f_${l.id}`;
        seen.add(key);
        const isSel = props.selectedListingId === l.id;
        const bg = isSel ? SEL_BG : cat;
        const html = makeContentHtml({ count: 1, bg, ids: '', singleId: String(l.id) });
        const existing = pool.get(key);
        if (existing) {
          existing.setPosition(new maps.LatLng(p.lat, p.lng));
          existing.setContent(html);
        } else {
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(p.lat, p.lng),
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
