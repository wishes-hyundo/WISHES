'use client';

import { useFavorites } from '@/contexts/FavoritesContext';
import Link from 'next/link';
import { Scale, X } from 'lucide-react';

export default function CompareFloatingBar() {
  const { compareList, removeFromCompare } = useFavorites();

  if (compareList.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-wishes-green">
            <Scale className="w-5 h-5" />
            <span className="font-semibold text-sm">비교 목록</span>
          </div>
          <div className="flex gap-2">
            {compareList.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-wishes-light/50 text-wishes-green text-xs rounded-full">
                매물 {String(id).substring(0, 6)}
                <button
                  onClick={() => removeFromCompare(id)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <span className="text-xs text-gray-400">({compareList.length}개 선택)</span>
        </div>
        <Link
          href="/compare"
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            compareList.length >= 2
              ? 'bg-wishes-green text-white hover:bg-wishes-dark shadow-md'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none'
          }`}
        >
          비교하기 ({compareList.length}/4)
        </Link>
      </div>
    </div>
  );
}
