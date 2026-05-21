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
  // Wave 78a/b: TIER1 단지 좌표 + cluster_token (I-MARKER-2/3)
  cluster_token?: string | null;
  building_name?: string | null;
  tier1_lat?: number | null;
  tier1_lng?: number | null;
}

// L-naver-zoom2: 정밀 검수 후 1단계 보정 (zoom = 20 - level).  MapClient 와 동일.
function levelToZoom(level: number): number {
  return Math.max(0, 20 - level);
}

function buildQs(
  bbox: { west: number; south: number; east: number; north: number },
  zoom: number,
  filter: FilterState,
): string {
  const p = new URLSearchParams();
  // 2026-05-22: bbox 를 줌별 격자에 스냅 (서버 rpc quantizeKey 와 동일 정밀도).
  //   기존 toFixed(3) 은 매 픽셀 팬마다 URL 이 미세하게 달라져 CDN 캐시 미적중.
  //   격자 스냅 → 같은 셀 안 팬은 동일 URL → Vercel edge 캐시 적중 → 즉시 응답.
  const _prec = zoom >= 15 ? 4 : zoom >= 12 ? 3 : zoom >= 9 ? 2 : 1;
  const _step = Math.pow(10, -_prec);
  const _fl = (v: number) => Math.floor(v / _step) * _step;
  const _cl = (v: number) => Math.ceil(v / _step) * _step;
  p.set('swLat', _fl(bbox.south).toFixed(_prec));
  p.set('swLng', _fl(bbox.west).toFixed(_prec));
  p.set('neLat', _cl(bbox.north).toFixed(_prec));
  p.set('neLng', _cl(bbox.east).toFixed(_prec));
  p.set('zoom', String(zoom));
  // L-filtercluster1 (2026-04-24 pm) + L-clustercat1 (2026-04-26):
  //   viewport 동일 필터 + 카테고리 → types 자동 매핑.
  //   사용자 피드백 "주거↔상가 변경 시 마커 카운트 동일" 해결.
  //   propertyTypes 가 명시 안 됐으면 카테고리에 해당하는 default types 사용.
  const deals = dealsToParam(filter.deals);
  if (deals) p.set('deals', deals);
  // G-111 (2026-05-04 사장님): default category mapping을 서버 RPC p_category로 위임.
  //   이전: client에서 propertyTypes를 hardcode list로 set → cluster RPC가
  //         residence 카테고리에서 cross-residential (사무실/근린/학원 < 50sqm) 미포함.
  //         viewport API는 cross-residential 포함하여 cluster vs panel count 차이 발생.
  //   현재: propertyTypes가 명시되면 그대로 보냄. 명시 안 됐으면 category만 보내고
  //         서버 RPC가 viewport categoryToTypeFilter와 동일 logic으로 매칭.
  if (filter.propertyTypes.length > 0) {
    p.set('types', filter.propertyTypes.join(','));
  } else if (filter.category && filter.category !== 'investment') {
    p.set('category', filter.category);
  }
  // 'investment'는 cross-cutting → category/types 모두 미적용 (전부 표시)
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
    }, 100);  // Wave 71: debounce 250 -> 100ms (5 업체 표준)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [bbox, kakaoLevel, filter]);

  return { clusters, loading };
}
