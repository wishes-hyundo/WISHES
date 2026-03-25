'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

interface ListingFiltersProps {
  dongs: string[];
  currentFilters: Record<string, string | undefined>;
}

const dealTypes = ['전세', '월세', '매매'];
const listingTypes = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];
const sortOptions = [
  { value: 'latest', label: '최신순' },
  { value: 'price', label: '가격순' },
  { value: 'area', label: '면적순' },
];

export function ListingFilters({ dongs, currentFilters }: ListingFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentFilters.search || currentFilters.listingNumber || '');

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.delete('listingNumber');
    params.delete('page');
    
    const trimmed = searchInput.trim();
    if (trimmed) {
      // If input is a number, treat as listing number
      if (/^\d+$/.test(trimmed)) {
        params.set('listingNumber', trimmed);
      } else {
        params.set('search', trimmed);
      }
    }
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams, searchInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="매물번호 또는 키워드로 검색 (예: 1234 또는 관악구 원룸)"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 bg-wishes-primary text-white rounded-lg text-sm font-medium hover:bg-wishes-primary/90 transition-colors flex items-center gap-1.5"
        >
          <Search className="w-4 h-4" />
          검색
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">필터</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          value={currentFilters.deal || ''}
          onChange={(e) => updateFilter('deal', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">거래유형 전체</option>
          {dealTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select
          value={currentFilters.type || ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">매물유형 전체</option>
          {listingTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select
          value={currentFilters.dong || ''}
          onChange={(e) => updateFilter('dong', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">지역 전체</option>
          {dongs.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <select
          value={currentFilters.sort || 'latest'}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          {sortOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>
    </div>
  );
}
