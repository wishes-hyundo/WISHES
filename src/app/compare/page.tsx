'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, X, Building2, MapPin, Maximize, Loader2, Check } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong } from '@/lib/utils';
import { useFavorites } from '@/contexts/FavoritesContext';
import type { Listing } from '@/types';

export default function ComparePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const { compareList, removeFromCompare, clearCompare } = useFavorites();

  useEffect(() => {
    async function fetchListings() {
      if (compareList.length === 0) {
        setListings([]);
        setLoading(false);
        return;
      }

      try {
        const ids = compareList.join(',');
        const res = await fetch(`/api/listings?ids=${ids}`);
        const json = await res.json();

        // 두 가지 응답 형식 모두 지원
        const data = json.data || json.listings || [];
        setListings(data);
      } catch (error) {
        console.error('매물 조회 실패:', error);
        setListings([]);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [compareList]);

  const handleRemove = (id: number) => {
    removeFromCompare(id);
    setListings(prev => prev.filter(l => l.id !== id));
  };

  if (loading) {
    return (
      <div className="pt-16 min-h-screen flex items-center justify-center bg-wishes-bg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-wishes-secondary animate-spin mx-auto mb-3" />
          <p className="text-wishes-muted text-sm">매물 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="pt-16 min-h-screen flex items-center justify-center bg-wishes-bg">
        <div className="text-center p-12">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-wishes-primary mb-2">비교할 매물이 없습니다</h2>
          <p className="text-wishes-muted mb-6">매물 목록에서 비교할 매물을 선택해주세요</p>
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl font-semibold hover:shadow-lg transition-all"
          >
            매물 보러가기
          </Link>
        </div>
      </div>
    );
  }

  // 비교 항목 정의
  const compareFields = [
    {
      label: '거래유형',
      render: (l: Listing) => (
        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${getDealColor(l.deal)}`}>
          {l.deal}
        </span>
      ),
    },
    {
      label: '가격',
      render: (l: Listing) => {
        const price = getFormattedPrice(l.deal, l.deposit, l.monthly, l.price);
        return <span className="font-bold text-wishes-primary">{price.main}</span>;
      },
    },
    {
      label: '매물유형',
      render: (l: Listing) => l.type,
    },
    {
      label: '위치',
      render: (l: Listing) => (
        <span className="flex items-center gap-1 text-sm">
          <MapPin className="w-3.5 h-3.5 text-wishes-muted shrink-0" />
          {l.dong || l.address}
        </span>
      ),
    },
    {
      label: '전용면적',
      render: (l: Listing) => (
        <span>
          {l.area_m2}㎡ <span className="text-wishes-muted text-xs">({sqmToPyeong(l.area_m2)}평)</span>
        </span>
      ),
    },
    {
      label: '층수',
      render: (l: Listing) => (
        <span>
          {l.floor_current}{l.floor_total ? `/${l.floor_total}층` : '층'}
        </span>
      ),
    },
    {
      label: '관리비',
      render: (l: Listing) =>
        l.maintenance_fee ? `${l.maintenance_fee.toLocaleString('ko-KR')}만원` : '-',
    },
    {
      label: '주차',
      render: (l: Listing) => (
        <span className={l.parking ? 'text-green-600' : 'text-gray-400'}>
          {l.parking ? <Check className="w-4 h-4 inline" /> : '—'}
        </span>
      ),
    },
    {
      label: '엘리베이터',
      render: (l: Listing) => (
        <span className={l.elevator ? 'text-green-600' : 'text-gray-400'}>
          {l.elevator ? <Check className="w-4 h-4 inline" /> : '—'}
        </span>
      ),
    },
    {
      label: '반려동물',
      render: (l: Listing) => (
        <span className={l.pet ? 'text-green-600' : 'text-gray-400'}>
          {l.pet ? <Check className="w-4 h-4 inline" /> : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* 헤더 */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/listings" className="text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold">매물 비교</h1>
          </div>
          <p className="text-white/70 text-sm">
            선택한 {listings.length}개 매물을 한눈에 비교해보세요
          </p>
        </div>
      </section>

      {/* 비교 테이블 - 데스크톱 */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 데스크톱: 테이블 레이아웃 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-32 md:w-40 p-3 text-left text-sm font-semibold text-wishes-muted bg-white rounded-tl-xl border-b border-gray-100">
                  항목
                </th>
                {listings.map((listing) => {
                  const img = listing.listing_images?.[0] || (listing as any).images?.[0];
                  return (
                    <th key={listing.id} className="p-3 bg-white border-b border-gray-100 min-w-[200px]">
                      <div className="relative">
                        <button
                          onClick={() => handleRemove(listing.id)}
                          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          title="비교에서 제거"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {img?.url ? (
                          <div className="w-full h-32 rounded-lg overflow-hidden mb-3">
                            <img
                              src={img.url}
                              alt={listing.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-32 rounded-lg bg-gray-100 flex items-center justify-center mb-3">
                            <Building2 className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                        <Link
                          href={`/listings/${listing.id}`}
                          className="text-sm font-bold text-wishes-primary hover:text-wishes-secondary transition-colors line-clamp-2"
                        >
                          {listing.title}
                        </Link>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {compareFields.map((field, idx) => (
                <tr key={field.label} className={idx % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}>
                  <td className="p-3 text-sm font-semibold text-wishes-muted border-r border-gray-100">
                    {field.label}
                  </td>
                  {listings.map((listing) => (
                    <td key={listing.id} className="p-3 text-sm text-wishes-text">
                      {field.render(listing)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일: 카드 레이아웃 */}
        <div className="md:hidden space-y-4">
          {listings.map((listing) => {
            const img = listing.listing_images?.[0] || (listing as any).images?.[0];
            return (
              <div key={listing.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="relative">
                  <button
                    onClick={() => handleRemove(listing.id)}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/80 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                    title="비교에서 제거"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {img?.url ? (
                    <div className="w-full h-40 overflow-hidden">
                      <img src={img.url} alt={listing.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                      <Building2 className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="text-base font-bold text-wishes-primary hover:text-wishes-secondary transition-colors"
                  >
                    {listing.title}
                  </Link>
                  <div className="mt-3 space-y-2">
                    {compareFields.map((field) => (
                      <div key={field.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-xs font-semibold text-wishes-muted">{field.label}</span>
                        <span className="text-sm text-wishes-text">{field.render(listing)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => { clearCompare(); setListings([]); }}
            className="text-sm text-wishes-muted hover:text-red-500 transition-colors"
          >
            전체 초기화
          </button>
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl font-semibold hover:shadow-lg transition-all"
          >
            매물 더 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
