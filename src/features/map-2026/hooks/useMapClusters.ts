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
  // L-filtercluster1 (2026-04-24 pm) + L-clustercat1 (2026-04-26):
  //   viewport 동일 필터 + 카테고리 → types 자동 매핑.
  //   사용자 피드백 "주거↔상가 변경 시 마커 카운트 동일" 해결.
  //   propertyTypes 가 명시 안 됐으면 카테고리에 해당하는 default types 사용.
  const deals = dealsToParam(filter.deals);
  if (deals) p.set('deals', deals);
  let types = filter.propertyTypes;
  if (types.length === 0) {
    // 카테고리별 default types
    if (filter.category === 'residence') {
      types = ['아파트','오피스텔','원룸','투룸','쓰리룸','빌라','주택','단독주택','다가구주택','다세대주택','연립주택','쉐어하우스','고시원','단기'];
    } else if (filter.category === 'retail_office') {
      types = ['상가','사무실','지식산업센터','복합건물','상가주택','사무용','오피스','점포','근생'];
    } else if (filter.category === 'land') {
      types = ['토지','대지','임야','전','답','과수원'];
    }
    // 'investment' 는 cross-cutting → 필터 미적용 (전부 표시)
  }
  if (types.length > 0) p.set('types', types.join(','));
  if (filter.minPrice != null) p.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice != null) p.set('maxPrice', String(filter.maxPrice));
  if (filter.minDeposit != null) p.set('minDeposit', String(filter.minDeposit));
  if (filter.maxDeposit != null) p.set('maxDeposit', String(filter.maxDeposit));
  if (filter.minMonthly != null) p.set('minMonthly', String(filter.minMonthly));
  if (filter.maxMonthly != null) p.set('maxMonthly', String(filter.maxMonthly));
  if (filter.minArea != null) p.set('minArea', String(filter.minArea));
  if (filter.maxArea != null) p.set('maxArea', String(filter.maxArea));
  if (filter.rooms.length > 0) p.set('rooms', filter.rooms.join(','));
  if (filter.newBuildYears != null) p.set('newBuild', String(filter.newBuildYears));
  if (filter.nearStation != null) p.set('nearStation', String(filter.nearStation));
  if (filter.features.length > 0) p.set('features', filter.features.join(','));
  if (filter.hasImages) p.set('hasImages', '1');
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
