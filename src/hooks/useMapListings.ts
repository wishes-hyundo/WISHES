'use client';

import { useState, useCallback, useRef } from 'react';
import type { Listing, MapBounds, ListingFilter } from '@/types';

export function useMapListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const isFirstLoad = useRef(true);
  const loadingTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const fetchListings = useCallback(async (bounds: MapBounds, filters: ListingFilter = {}) => {
    // 이전 디바운스 타이머 취소
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const doFetch = async () => {
      // 이전 진행 중인 요청 취소 (중복 요청 방지)
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      // 로딩 표시를 300ms 후에만 보여줌 (빠른 응답이메 깜빡임 방지)
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = setTimeout(() => setLoading(true), 300);

      try {
        const params = new URLSearchParams({
          swLat: bounds.swLat.toString(),
          swLng: bounds.swLng.toString(),
          neLat: bounds.neLat.toString(),
          neLng: bounds.neLng.toString(),
        });

        if (filters.deal) params.set('deal', filters.deal);
        if (filters.type) params.set('type', filters.type);
        if (filters.minDeposit) params.set('minDeposit', filters.minDeposit.toString());
        if (filters.maxDeposit) params.set('maxDeposit', filters.maxDeposit.toString());

        const res = await fetch(`/api/listings/map?${params}`, {
          signal: abortRef.current.signal,
        });
        const data = await res.json();

        if (data.success) {
          setListings(data.data);
          setTotal(data.total || data.data.length);
        }
      } catch (error: unknown) {
        // AbortError는 정상적인 취소이므로 무시
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('매물 조회 실패:', error);
      } finally {
        // 로딩 타이머 취소 + 로딩 해제
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        setLoading(false);
      }
    };

    // 첫 번째 로드는 디바운스 없이 즉시 실행
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      doFetch();
    } else {
      debounceRef.current = setTimeout(doFetch, 150);
    }
  }, []);

  return { listings, loading, total, fetchListings };
}
