'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: number[];
  recentlyViewed: number[];
  compareList: number[];
  favoritesLoading: boolean;
  addFavorite: (id: number) => void;
  removeFavorite: (id: number) => void;
  toggleFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;
  addRecentlyViewed: (id: number) => void;
  addToCompare: (id: number) => void;
  removeFromCompare: (id: number) => void;
  clearCompare: () => void;
  isInCompare: (id: number) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);

  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem('wishes_favorites');
      const savedCompare = localStorage.getItem('wishes_compare');
      const savedRecent = localStorage.getItem('wishes_recently_viewed');
      if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
      if (savedCompare) setCompareList(JSON.parse(savedCompare));
      if (savedRecent) setRecentlyViewed(JSON.parse(savedRecent));
    } catch {}
    setFavoritesLoading(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('wishes_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem('wishes_compare', JSON.stringify(compareList));
    } catch {}
  }, [compareList]);

  useEffect(() => {
    try {
      localStorage.setItem('wishes_recently_viewed', JSON.stringify(recentlyViewed));
    } catch {}
  }, [recentlyViewed]);

  const addFavorite = (id: number) => {
    setFavorites(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const removeFavorite = (id: number) => {
    setFavorites(prev => prev.filter(f => f !== id));
  };

  const toggleFavorite = (id: number) => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const isFavorite = (id: number) => favorites.includes(id);

  const addRecentlyViewed = (id: number) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(v => v !== id);
      return [id, ...filtered].slice(0, 20);
    });
  };

  const addToCompare = (id: number) => {
    setCompareList(prev => {
      if (prev.includes(id)) return prev;
      if (prev.length >= 4) {
        alert('비교는 최대 4개까지 가능합니다.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const removeFromCompare = (id: number) => {
    setCompareList(prev => prev.filter(c => c !== id));
  };

  const clearCompare = () => {
    setCompareList([]);
  };

  const isInCompare = (id: number) => compareList.includes(id);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        recentlyViewed,
        compareList,
        favoritesLoading,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        isFavorite,
        addRecentlyViewed,
        addToCompare,
        removeFromCompare,
        clearCompare,
        isInCompare,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
