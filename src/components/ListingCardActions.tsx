'use client';

import { useState } from 'react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useAuth } from '@/contexts/AuthContext';

interface ListingCardActionsProps {
  listingId: string;
}

export default function ListingCardActions({ listingId }: ListingCardActionsProps) {
  const { isFavorite, toggleFavorite, isInCompare, toggleCompare } = useFavorites();
  const { user, setShowAuthModal, setAuthModalMessage } = useAuth();
  const [showToast, setShowToast] = useState<string | null>(null);
  const numericId = Number(listingId);

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 비로그인 상태에서 찜 클릭 시 로그인 유도
    if (!user) {
      setAuthModalMessage('로그인하면 찜 목록이 어디서든 저장됩니다');
      setShowAuthModal(true);
      return;
    }

    toggleFavorite(numericId);
    const msg = isFavorite(numericId) ? '찜 목록에서 제거되었습니다' : '찜 목록에 추가되었습니다';
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2000);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      setAuthModalMessage('로그인하면 매물 비교 기능을 이용할 수 있습니다');
      setShowAuthModal(true);
      return;
    }

    const result = toggleCompare(numericId);
    if (result === false && !isInCompare(numericId)) {
      setShowToast('비교는 최대 4개까지 가능합니다');
    } else {
      const msg = isInCompare(numericId)
        ? '비교 목록에서 제거'
        : '비교 목록에 추가';
      setShowToast(msg);
    }
    setTimeout(() => setShowToast(null), 2000);
  };

  return (
    <>
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <button
          onClick={handleFavorite}
          className={`p-1.5 rounded-full shadow-md transition-all duration-200 ${
            isFavorite(numericId)
              ? 'bg-red-500 text-white'
              : 'bg-white/90 text-gray-400 hover:text-red-500'
          }`}
          title="찜"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill={isFavorite(numericId) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        <button
          onClick={handleCompare}
          className={`p-1.5 rounded-full shadow-md transition-all duration-200 ${
            isInCompare(numericId)
              ? 'bg-amber-500 text-white'
              : 'bg-white/90 text-gray-400 hover:text-amber-500'
          }`}
          title="비교"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>
      {showToast && (
        <div className="absolute top-12 right-2 z-20 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg animate-fade-in">
          {showToast}
        </div>
      )}
    </>
  );
}