'use client';

import { useEffect } from 'react';
import { Scale } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';

interface DetailClientActionsProps {
  listingId: number;
}

export default function DetailClientActions({ listingId }: DetailClientActionsProps) {
  const { isInCompare, addToCompare, removeFromCompare } = useFavorites();
  const inCompare = isInCompare(listingId);

  useEffect(() => {
    if (!listingId) return;
    try {
      const stored = JSON.parse(localStorage.getItem('wishes_recent_viewed') || '[]');
      const filtered = stored.filter((item: any) => item.id !== listingId);
      filtered.unshift({ id: listingId, visitedAt: Date.now() });
      localStorage.setItem('wishes_recent_viewed', JSON.stringify(filtered.slice(0, 20)));
    } catch (e) { /* ignore */ }
  }, [listingId]);

  return (
    <button
      onClick={() => inCompare ? removeFromCompare(listingId) : addToCompare(listingId)}
      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
        inCompare 
          ? 'bg-wishes-primary text-white' 
          : 'bg-gray-100 text-gray-600 hover:bg-wishes-secondary hover:text-white'
      }`}
    >
      <Scale className="w-5 h-5" />
      {inCompare ? '비교 해제' : '비교 담기'}
    </button>
  );
}
