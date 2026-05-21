/**
 * search-2026 — React Query 훅 (P1 데이터 계층)
 *
 * 레거시는 content.js 가 73K 매물을 통째로 들고 멈췄다. 재구축은:
 *   · useSearchListings — 서버 페이지네이션 무한 스크롤 (가상화와 결합 예정)
 *   · useListingDetail  — 모달용 단건 조회
 * 캐시·영속화는 QueryProvider(TanStack Query 5 + IndexedDB)가 담당.
 * 기준: ★search_완전기능명세서.md §3, §8.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchListingDetail, fetchSearchListings } from './api';
import { DEFAULT_PER_PAGE, type SearchFilters, type SearchListing, type SearchPage } from './types';

/**
 * 매물 목록 — 무한 스크롤. 필터가 바뀌면 queryKey 가 바뀌어 자동 재조회.
 * pages.flatMap 으로 누적 목록을, page1 의 total 로 전체 건수를 얻는다.
 */
export function useSearchListings(filters: SearchFilters, perPage: number = DEFAULT_PER_PAGE) {
  const query = useInfiniteQuery({
    queryKey: ['search-2026', 'listings', filters, perPage],
    queryFn: ({ pageParam, signal }) =>
      fetchSearchListings(filters, pageParam as number, perPage, signal),
    initialPageParam: 1,
    getNextPageParam: (last: SearchPage) => (last.hasMore ? last.page + 1 : undefined),
    // 인증 실패(401/403)는 재시도 무의미 — 미인증 시 즉시 mock 폴백.
    retry: (count, err) =>
      !/\b40[13]\b/.test(String((err as Error)?.message ?? '')) && count < 2,
  });

  const listings: SearchListing[] = (query.data?.pages ?? []).flatMap((p) => p.listings);
  const total: number = query.data?.pages?.[0]?.total ?? 0;

  return { ...query, listings, total };
}

/** 매물 1건 상세 — 모달 열릴 때. id 가 null 이면 비활성. */
export function useListingDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: ['search-2026', 'detail', id],
    queryFn: ({ signal }) => fetchListingDetail(id as number, signal),
    enabled: id != null,
  });
}
