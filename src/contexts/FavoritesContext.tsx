'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createAuthClient } from '@/lib/supabase';

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
  favoritesLoading: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const { user } = useAuth();

  // Load recently viewed & compare from localStorage on mount
  useEffect(() => {
    try {
      setRecentlyViewed(JSON.parse(localStorage.getItem('recently_viewed') || '[]'));
      setCompareList(JSON.parse(localStorage.getItem('compare_ids') || '[]'));
    } catch {}
  }, []);

  // Load favorites: from Supabase if logged in, from localStorage otherwise
  useEffect(() => {
    if (user) {
      setFavoritesLoading(true);
      const supabase = createAuthClient();
      supabase
        .from('favorites')
        .select('listing_id')
        .eq('user_id', user.id)
        .then(({ data, error }) => {
          if (!error && data) {
            const ids = data.map((row: { listing_id: number }) => row.listing_id);
            setFavorites(ids);
            // Also sync to localStorage as backup
            localStorage.setItem('favorites', JSON.stringify(ids));
          }
          setFavoritesLoading(false);
        });
    } else {
      // Not logged in: use localStorage
      try {
        setFavorites(JSON.parse(localStorage.getItem('favorites') || '[]'));
      } catch {
        setFavorites([]);
      }
    }
  }, [user]);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => {
      const isCurrentlyFav = prev.includes(id);
      const next = isCurrentlyFav ? prev.filter(f => f !== id) : [...prev, id];

      // Always update localStorage
      localStorage.setItem('favorites', JSON.stringify(next));

      // If logged in, sync to Supabase
      if (user) {
        const supabase = createAuthClient();
        if (isCurrentlyFav) {
          supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('listing_id', id)
            .then(() => {});
        } else {
          supabase
            .from('favorites')
            .insert({ user_id: user.id, listing_id: id })
            .then(() => {});
        }
      }

      return next;
    });
  }, [user]);

  const isFavorite = useCallback((id: number) => favorites.includes(id), [favorites]);

  const addRecentlyViewed = useCallback((id: number) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(r => r !== id);
      const next = [id, ...filtered].slice(0, 20);
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
      favorites,
      recentlyViewed,
      compareList,
      toggleFavorite,
      isFavorite,
      addRecentlyViewed,
      toggleCompare,
      isInCompare,
      compareCount: compareList.length,
      clearCompare,
      favoritesLoading,
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
