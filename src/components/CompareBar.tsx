'use client';

import { useFavorites } from '@/contexts/FavoritesContext';
import { useRouter } from 'next/navigation';

export default function CompareBar() {
  const { compareList, clearCompare } = useFavorites();
  const router = useRouter();

  if (compareList.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-2xl border-t border-amber-400 mobile-nav-offset">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-semibold text-sm">비교 목록</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-xs font-bold ${
                  i <= compareList.length
                    ? 'border-white bg-white/20'
                    : 'border-white/30 bg-white/5'
                }`}
              >
                {i <= compareList.length ? i : ''}
              </div>
            ))}
          </div>
          <span className="text-sm opacity-90">{compareList.length}/4 선택</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clearCompare()}
            className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            초기화
          </button>
          <button
            onClick={() => router.push('/compare')}
            disabled={compareList.length < 2}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              compareList.length >= 2
                ? 'bg-white text-amber-600 hover:bg-gray-100 shadow-lg'
                : 'bg-white/30 text-white/60 cursor-not-allowed'
            }`}
          >
            비교하기 →
          </button>
        </div>
      </div>
    </div>
  );
}