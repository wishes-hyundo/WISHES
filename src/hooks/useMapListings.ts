'use client';

import { useState, useCallback, useRef } from 'react';
import type { Listing, MapBounds, ListingFilter } from '@/types';

export function useMapListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>();
  const abortRef = useRef<AbortController>();

  const fetchListings = useCallback(async (bounds: MapBounds, filters: ListingFilter = {}) => {
    // 이전 디바운스 타이머 취소
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // 이전 진행 중인 요청 취소 (중복 요청 방지)
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      setLoading(true);
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
        setLoading(false);
      }
    }, 500); // 500ms 디바운싱 (기존 300ms → 500ms로 증가)
  }, []);

  return { listings, loading, total, fetchListings };
}
