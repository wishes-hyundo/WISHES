// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useMapClusters — L-worldclass1 (2026-04-24 pm)
// 서버 사전집계 클러스터 fetch (기존 파이프라인 복원)
//
// 배경:
//   /api/map/clusters 는 rpc_map_clusters RPC 로 연결된 세계급 파이프라인이다.
//   · PostGIS GIST (geom) + H3 hexagon MV (r6/r8/r10) 사전집계
//   · Quadkey quantize 된 bounds 로 L1 cache HIT
//   · 줌별 grid 자동 전환 (시 → 구 → 동 → 블록 → 건물 → 개별)
//   · 4초 DB timeout, 15s fresh / 120s stale SWR
//   응답 shape: [{ cluster_id, lat, lng, count, min_price, avg_price, sample_ids }]
//   payload ~10KB (vs viewport API 2MB) · 레이턴시 <100ms (pre-aggregated).
//
// 이 훅의 역할:
//   · bbox + Kakao level → (debounce 250ms) → /api/map/clusters 호출
//   · AbortController 로 경쟁 조건 차단
//   · 실패 시 안전하게 [] 반환 (지도 페이지 블록 방지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState } from 'react';
import { useMap2026Store, type FilterState } from '../store';
import { dealsToParam } from '../lib/priceFormat';

export interface ServerCluster {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  min_price?: number | null;
  avg_price?: number | null;
  max_price?: number | null;
  sample_ids?: number[] | null;
}

// Kakao level(1~14) → 표준 웹 zoom(5~17).  MapClient 와 동일 공식.
function levelToZoom(level: number): number {
  return Math.max(0, 18 - level);
}

function buildQs(
  bbox: { west: number; south: number; east: number; north: number },
  zoom: number,
  filter: FilterState,
): string {
  const p = new URLSearchParams();
  p.set('swLat', bbox.south.toFixed(6));
  p.set('swLng', bbox.west.toFixed(6));
  p.set('neLat', bbox.north.toFixed(6));
  p.set('neLng', bbox.east.toFixed(6));
  p.set('zoom', String(zoom));
  const deals = dealsToParam(filter.deals);
  if (deals) p.set('deal', deals);
  if (filter.minPrice != null) p.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice != null) p.set('maxPrice', String(filter.maxPrice));
  // propertyTypes 단일화 — RPC 는 single type 만 받으므로 첫 값.  다중 지원은
  // viewport API 쪽이 담당하고 클러스터는 coarse view 라 허용.
  if (filter.propertyTypes.length === 1) p.set('type', filter.propertyTypes[0]);
  return p.toString();
}

export function useMapClusters(kakaoLevel: number) {
  const bbox = useMap2026Store((s) => s.bbox);
  const filter = useMap2026Store((s) => s.filter);
  const [clusters, setClusters] = useState<ServerCluster[]>([]);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bbox) return;
    // bbox 유효성 (너무 크면 전국을 한 덩이로 주므로 스킵 — 초기 idle 이벤트 방지)
    if (
      !Number.isFinite(bbox.west) || !Number.isFinite(bbox.south) ||
      !Number.isFinite(bbox.east) || !Number.isFinite(bbox.north)
    ) return;
    if (bbox.east <= bbox.west || bbox.north <= bbox.south) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const zoom = levelToZoom(kakaoLevel);
        const qs = buildQs(bbox, zoom, filter);
        const res = await fetch(`/api/map/clusters?${qs}`, { signal: ctrl.signal });
        if (!res.ok) {
          if (!ctrl.signal.aborted) setClusters([]);
          return;
        }
        const json = await res.json();
        if (!ctrl.signal.aborted) setClusters(Array.isArray(json?.data) ? json.data : []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[useMapClusters]', err);
          if (!ctrl.signal.aborted) setClusters([]);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [bbox, kakaoLevel, filter]);

  return { clusters, loading };
}
