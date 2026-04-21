'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
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

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // 필터 변경 시 1페이지로
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">필터</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {/* 거래유형 */}
        <select
          value={currentFilters.deal || ''}
          onChange={(e) => updateFilter('deal', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">거래유형 전체</option>
          {dealTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* 매물유형 */}
        <select
          value={currentFilters.type || ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">매물유형 전체</option>
          {listingTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* 동 선택 */}
        <select
          value={currentFilters.dong || ''}
          onChange={(e) => updateFilter('dong', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          <option value="">지역 전체</option>
          {dongs.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* 정렬 */}
        <select
          value={currentFilters.sort || 'latest'}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
