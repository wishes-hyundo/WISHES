'use client';

import { useState, useMemo } from 'react';
import { listings } from '@/data/listings';
import ListingCard from '@/components/ListingCard';

export default function ListingsPage() {
  const [dealFilter, setDealFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [dongFilter, setDongFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('latest');

  const filtered = useMemo(() => {
    let result = listings.filter(l => l.status !== '계약완료');
    if (dealFilter) result = result.filter(l => l.deal === dealFilter);
    if (typeFilter) result = result.filter(l => l.type === typeFilter);
    if (dongFilter) result = result.filter(l => l.dong === dongFilter);

    if (sortBy === 'price-low') result.sort((a, b) => a.deposit - b.deposit);
    if (sortBy === 'price-high') result.sort((a, b) => b.deposit - a.deposit);
    if (sortBy === 'area') result.sort((a, b) => b.area - a.area);
    if (sortBy === 'latest') result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return result;
  }, [dealFilter, typeFilter, dongFilter, sortBy]);

  const deals = ['전세', '월세', '매매'];
  const types = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];
  const dongs = Array.from(new Set(listings.map(l => l.dong)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-2">전체 매물</h1>
        <p className="text-sm text-gray-500">서울 관악구 싨림동 · 봉천동 일대</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 mb-6 sm:mb-8">
        <div className="flex flex-wrap gap-3 sm:gap-4">
          {/* Deal Type */}
          <div className="w-full sm:w-auto">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">거래유형</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setDealFilter('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !dealFilter ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체
              </button>
              {deals.map(d => (
                <button
                  key={d}
                  onClick={() => setDealFilter(dealFilter === d ? '' : d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    dealFilter === d ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Room Type */}
          <div className="w-full sm:w-auto">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">매물유형</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 outline-none focus:border-brand-secondary min-w-[120px]"
            >
              <option value="">전체</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Location */}
          <div className="w-full sm:w-auto">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">지역</label>
            <select
              value={dongFilter}
              onChange={(e) => setDongFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 outline-none focus:border-brand-secondary min-w-[120px]"
            >
              <option value="">전체</option>
              {dongs.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Sort */}
          <div className="w-full sm:w-auto sm:ml-auto">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">정렬</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 outline-none focus:border-brand-secondary min-w-[140px]"
            >
              <option value="latest">최신순</option>
              <option value="price-low">가격 낮은순</option>
              <option value="price-high">가격 높은순</option>
              <option value="area">면적 넓은순</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          총 <span className="font-bold text-brand-secondary">{filtered.length}</span>건
        </p>
      </div>

      {/* Listings Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filtered.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🏠</div>
          <p className="text-gray-500 text-lg mb-2">조건에 맞는 매물이 없습니다</p>
          <p className="text-gray-400 text-sm">필터를 변경하거나 전화 상담을 이용해주세요</p>
          <a href="tel:1533-9580" className="inline-flex items-center gap-2 mt-6 bg-brand-primary text-white px-6 py-3 rounded-full text-sm font-semibold">
            1533-9580 전화상담
          </a>
        </div>
      )}
    </div>
  );
}
