// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useMapClusters — 줌 기반 자동 분기 (클러스터 ↔ 개별 매물)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Kakao zoom level 은 카카오 API 에서 1(확대) ~ 14(축소) 범위.
// 우리는 Google Maps 스타일로 역환산:
//   kakao_level 1  → gmZoom ~18 (개별 매물)
//   kakao_level 3  → gmZoom ~16
//   kakao_level 5  → gmZoom ~14
//   kakao_level 10 → gmZoom ~9
//   kakao_level 14 → gmZoom ~5
//
// 훅은 bounds + kakao level 을 받아서:
//   gmZoom >= 17 → /api/map/items  (개별)
//   그 외        → /api/map/clusters
// 로 자동 분기 후 TanStack Query 캐싱.

'use client';

import { useQuery } from '@tanstack/react-query';
import type { MapBounds } from '@/types';
import type { MapCluster, MapItem } from '@/components/map/KakaoDeckOverlay';

export interface ClusterFilters {
  deal?: string | null;
  type?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

/** Kakao level → Google Maps zoom 근사 */
export function kakaoLevelToGmZoom(level: number): number {
  // 경험적 환산 (카카오 level 1~14 → zoom 19~5)
  return Math.max(5, Math.min(19, 19 - level));
}

interface Result {
  mode: 'clusters' | 'items';
  clusters: MapCluster[];
  items: MapItem[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

export function useMapClusters(
  bounds: MapBounds | null,
  kakaoLevel: number,
  filters: ClusterFilters = {},
  enabled = true,
): Result {
  const gmZoom = kakaoLevelToGmZoom(kakaoLevel);
  const mode: 'clusters' | 'items' = gmZoom >= 17 ? 'items' : 'clusters';

  // bounds 양자화: 같은 화면 반복 요청 캐시 히트
  const precision = gmZoom >= 15 ? 4 : gmZoom >= 12 ? 3 : 2;
  const q = (n: number) => n.toFixed(precision);
  const boundsKey = bounds
    ? `${q(bounds.swLat)},${q(bounds.swLng)}-${q(bounds.neLat)},${q(bounds.neLng)}`
    : '';

  const qk = [
    'map',
    mode,
    boundsKey,
    gmZoom,
    filters.deal || '',
    filters.type || '',
    filters.minPrice || '',
    filters.maxPrice || '',
  ];

  const queryFn = async () => {
    if (!bounds) return { clusters: [], items: [], total: 0 };
    const params = new URLSearchParams({
      swLat: String(bounds.swLat),
      swLng: String(bounds.swLng),
      neLat: String(bounds.neLat),
      neLng: String(bounds.neLng),
    });
    if (mode === 'clusters') params.set('zoom', String(gmZoom));
    if (filters.deal) params.set('deal', filters.deal);
    if (filters.type) params.set('type', filters.type);
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));

    const url = mode === 'clusters' ? `/api/map/clusters?${params}` : `/api/map/items?${params}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('map fetch failed');
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'map fetch failed');
    if (mode === 'clusters') {
      return { clusters: (json.data || []) as MapCluster[], items: [], total: json.total || 0 };
    }
    return { clusters: [], items: (json.data || []) as MapItem[], total: json.total || 0 };
  };

  const query = useQuery({
    queryKey: qk,
    queryFn,
    enabled: enabled && !!bounds,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev, // 줌/팬 중 이전 결과 유지 → 깜빡임 방지
  });

  return {
    mode,
    clusters: query.data?.clusters || [],
    items: query.data?.items || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
