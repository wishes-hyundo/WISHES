'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';

interface Listing {
  id: number;
  [key: string]: any;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-6 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function ListingsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [dongs, setDongs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const page = parseInt(searchParams?.get('page') || '1', 10);
  const pageSize = 12;

  const currentFilters: Record<string, string | undefined> = {
    search: searchParams?.get('search') || undefined,
    deal: searchParams?.get('deal') || undefined,
    type: searchParams?.get('type') || undefined,
    dong: searchParams?.get('dong') || undefined,
    sort: searchParams?.get('sort') || undefined,
    listingNumber: searchParams?.get('listingNumber') || undefined,
    minDeposit: searchParams?.get('minDeposit') || undefined,
    maxDeposit: searchParams?.get('maxDeposit') || undefined,
  };

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const offset = (page - 1) * pageSize;
      params.set('limit', String(pageSize));
      params.set('offset', String(offset));
      
      if (currentFilters.search) params.set('search', currentFilters.search);
      if (currentFilters.deal) params.set('deal', currentFilters.deal);
      if (currentFilters.type) params.set('type', currentFilters.type);
      if (currentFilters.dong) params.set('dong', currentFilters.dong);
      if (currentFilters.sort) params.set('sort', currentFilters.sort);
      if (currentFilters.listingNumber) params.set('listingNumber', currentFilters.listingNumber);
      if (currentFilters.minDeposit) params.set('minDeposit', currentFilters.minDeposit);
      if (currentFilters.maxDeposit) params.set('maxDeposit', currentFilters.maxDeposit);

      const res = await fetch(`/api/listings?${params.toString()}`);
      const json = await res.json();
      
      if (json.success) {
        setListings(json.data || []);
        setTotalCount(json.pagination?.total || json.data?.length || 0);
        setDongs(json.filters?.dongs || []);
      } else {
        setListings(json.listings || json.data || []);
        setDongs([]);
      }
    } catch (err) {
      console.error('Failed to fetch listings:', err);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams.toString()]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <ListingFilters dongs={dongs} currentFilters={currentFilters} />

      {currentFilters.listingNumber && (
        <p className="text-sm text-gray-500 mt-2">
          매물번호 <strong className="text-wishes-primary">#{currentFilters.listingNumber}</strong> 검색 결과
        </p>
      )}

      {loading ? (
        <>
          <p className="text-sm text-gray-400 mt-4 mb-4 animate-pulse">매물을 불러오는 중...</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (<SkeletonCard key={i} />))}
          </div>
        </>
      ) : listings.length > 0 ? (
        <>
          <p className="text-sm text-gray-500 mt-4 mb-4">총 <strong className="text-wishes-dark">{totalCount}건</strong>의 매물</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (<ListingCard key={listing.id} listing={listing as any} />))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('page', String(p));
                    router.push(`/listings?${params.toString()}`);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? 'bg-wishes-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>검색 결과가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
