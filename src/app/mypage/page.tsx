'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, Building2, ArrowLeft, Trash2 } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';

export default function MyPage() {
  const { favorites, removeFavorite } = useFavorites();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFavorites() {
      if (favorites.length === 0) {
        setListings([]);
        setLoading(false);
        return;
      }

      try {
        const ids = favorites.join(',');
        const res = await fetch(`/api/listings?ids=${ids}`);
        const json = await res.json();
        const data = json.data || json.listings || [];
        setListings(data);
      } catch (error) {
        console.error('찜 목록 조회 오류:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchFavorites();
  }, [favorites]);

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-wishes-secondary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-wishes-primary flex items-center gap-2">
                <Heart className="w-6 h-6 text-red-400" />
                찜한 매물
              </h1>
              <p className="text-sm text-gray-500 mt-1">관심 매물을 모아서 확인하세요</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-4 border-wishes-secondary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500">불러오는 중...</p>
          </div>
        ) : listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              총 <strong className="text-wishes-primary">{listings.length}</strong>개의 찜한 매물
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((listing) => (
                <div key={listing.id} className="relative">
                  <ListingCard listing={listing} />
                  <button
                    onClick={() => removeFavorite(listing.id)}
                    className="absolute top-3 right-3 z-10 bg-white/90 p-2 rounded-full shadow-md hover:bg-red-50 transition"
                    title="찜 해제"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">찜한 매물이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">매물 목록에서 하트를 눌러 관심 매물을 저장하세요</p>
            <Link
              href="/listings"
              className="inline-block mt-4 px-6 py-2 bg-wishes-secondary text-white rounded-lg text-sm font-semibold hover:bg-wishes-primary transition"
            >
              매물 둘러보기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
