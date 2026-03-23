'use client';

import { useState, useCallback, useRef } from 'react';
import type { Listing, MapBounds, ListingFilter } from '@/types';

export function useMapListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchListings = useCallback(async (bounds: MapBounds, filters: ListingFilter = {}) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
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

        const res = await fetch(`/api/listings/map?${params}`);
        const data = await res.json();

        if (data.success) {
          setListings(data.data);
          setTotal(data.total || data.data.length);
        }
      } catch (error) {
        console.error('매물 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms 디바운싱
  }, []);

  return { listings, loading, total, fetchListings };
}
