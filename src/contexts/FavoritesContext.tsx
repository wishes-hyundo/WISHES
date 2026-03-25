'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: number[];
  recentlyViewed: number[];
  compareList: number[];
  toggleFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;
  addRecentlyViewed: (id: number) => void;
  toggleCompare: (id: number) => void;
  isInCompare: (id: number) => boolean;
  compareCount: number;
  clearCompare: () => void;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem('favorites') || '[]'));
      setRecentlyViewed(JSON.parse(localStorage.getItem('recently_viewed') || '[]'));
      setCompareList(JSON.parse(localStorage.getItem('compare_ids') || '[]'));
    } catch {}
  }, []);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem('favorites', JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: number) => favorites.includes(id), [favorites]);

  const addRecentlyViewed = useCallback((id: number) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(r => r !== id);
      const next = [id, ...filtered].slice(0, 20); // 최대 20개
      localStorage.setItem('recently_viewed', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: number) => {
    setCompareList(prev => {
      let next: number[];
      if (prev.includes(id)) {
        next = prev.filter(c => c !== id);
      } else {
        if (prev.length >= 4) {
          alert('최대 4개까지 비교할 수 있습니다.');
          return prev;
        }
        next = [...prev, id];
      }
      localStorage.setItem('compare_ids', JSON.stringify(next));
      return next;
    });
  }, []);

  const isInCompare = useCallback((id: number) => compareList.includes(id), [compareList]);

  const clearCompare = useCallback(() => {
    setCompareList([]);
    localStorage.setItem('compare_ids', '[]');
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favorites, recentlyViewed, compareList,
      toggleFavorite, isFavorite, addRecentlyViewed,
      toggleCompare, isInCompare, compareCount: compareList.length,
      clearCompare,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
