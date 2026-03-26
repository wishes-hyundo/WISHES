'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: number[];
  compareList: number[];
  addFavorite: (id: number) => void;
  removeFavorite: (id: number) => void;
  toggleFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;
  addToCompare: (id: number) => void;
  removeFromCompare: (id: number) => void;
  clearCompare: () => void;
  isInCompare: (id: number) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);

  // localStorage에서 복원
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem('wishes_favorites');
      const savedCompare = localStorage.getItem('wishes_compare');
      if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
      if (savedCompare) setCompareList(JSON.parse(savedCompare));
    } catch {}
  }, []);

  // localStorage에 저장
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

  const addFavorite = (id: number) => {
    setFavorites(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const removeFavorite = (id: number) => {
    setFavorites(prev => prev.filter(f => f !== id));
  };

  const toggleFavorite = (id: number) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const isFavorite = (id: number) => favorites.includes(id);

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
    <FavoritesContext.Provider value={{
      favorites,
      compareList,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      isFavorite,
      addToCompare,
      removeFromCompare,
      clearCompare,
      isInCompare,
    }}>
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
