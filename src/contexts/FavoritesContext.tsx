'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Dedupe favorites fetch across StrictMode re-mounts
let _favLastToken: string | null = null;

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
  const { user, session } = useAuth();
  const [favorites, setFavorites] = useState<number[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  // 로그인 시 서버에서 찜 목록 불러오기
  useEffect(() => {
    if (user && session?.access_token) {
      if (_favLastToken === session.access_token) return;
      _favLastToken = session.access_token;
      setFavoritesLoading(true);
      fetch('/api/favorites', {
        headers: { 'Authorization': 'Bearer ' + session.access_token },
      })
        .then(r => r.json())
        .then(data => {
          if (data.favorites) {
            // 로컬 찜 목록과 서버 찜 목록 병합
            const local = JSON.parse(localStorage.getItem('wishes_favorites') || '[]');
            const merged = Array.from(new Set([...data.favorites, ...local]));
            setFavorites(merged);
            // 로컬에만 있는 것들 서버에 동기화
            const newOnes = local.filter((id: number) => !data.favorites.includes(id));
            newOnes.forEach((id: number) => {
              fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
                body: JSON.stringify({ listing_id: id }),
              }).catch(() => {});
            });
          }
          setSynced(true);
          setFavoritesLoading(false);
        })
        .catch(() => setFavoritesLoading(false));
    } else if (!user) {
      // 비로그인: localStorage에서 불러오기
      try {
        const saved = localStorage.getItem('wishes_favorites');
        if (saved) setFavorites(JSON.parse(saved));
      } catch {}
      setSynced(false);
      setFavoritesLoading(false);
    }
  }, [user, session]);

  // 최근 본 매물, 비교 목록은 localStorage
  useEffect(() => {
    try {
      const savedCompare = localStorage.getItem('wishes_compare');
      const savedRecent = localStorage.getItem('wishes_recently_viewed');
      if (savedCompare) setCompareList(JSON.parse(savedCompare));
      if (savedRecent) setRecentlyViewed(JSON.parse(savedRecent));
    } catch {}
  }, []);

  // favorites 변경 시 localStorage 동기화
  useEffect(() => {
    try { localStorage.setItem('wishes_favorites', JSON.stringify(favorites)); } catch {}
  }, [favorites]);

  useEffect(() => {
    try { localStorage.setItem('wishes_compare', JSON.stringify(compareList)); } catch {}
  }, [compareList]);

  useEffect(() => {
    try { localStorage.setItem('wishes_recently_viewed', JSON.stringify(recentlyViewed)); } catch {}
  }, [recentlyViewed]);

  const addFavorite = useCallback((id: number) => {
    setFavorites(prev => prev.includes(id) ? prev : [...prev, id]);
    if (session?.access_token) {
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ listing_id: id }),
      }).catch(() => {});
    }
  }, [session]);

  const removeFavorite = useCallback((id: number) => {
    setFavorites(prev => prev.filter(f => f !== id));
    if (session?.access_token) {
      fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ listing_id: id }),
      }).catch(() => {});
    }
  }, [session]);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => {
      const isCurrentlyFav = prev.includes(id);
      if (isCurrentlyFav) {
        if (session?.access_token) {
          fetch('/api/favorites', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ listing_id: id }),
          }).catch(() => {});
        }
        return prev.filter(f => f !== id);
      } else {
        if (session?.access_token) {
          fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({ listing_id: id }),
          }).catch(() => {});
        }
        return [...prev, id];
      }
    });
  }, [session]);

  const isFavorite = useCallback((id: number) => favorites.includes(id), [favorites]);

  const addRecentlyViewed = useCallback((id: number) => {
    setRecentlyViewed(prev => {
      if (prev[0] === id) return prev;
      const filtered = prev.filter(v => v !== id);
      return [id, ...filtered].slice(0, 20);
    });
  }, []);

  const addToCompare = useCallback((id: number) => {
    setCompareList(prev => {
      if (prev.includes(id)) return prev;
      if (prev.length >= 4) { alert('비교는 최대 4개까지 가능합니다.'); return prev; }
      return [...prev, id];
    });
  }, []);

  const removeFromCompare = useCallback((id: number) => {
    setCompareList(prev => prev.filter(c => c !== id));
  }, []);

  const clearCompare = useCallback(() => { setCompareList([]); }, []);

  const isInCompare = useCallback((id: number) => compareList.includes(id), [compareList]);

  return (
    <FavoritesContext.Provider value={{
      favorites, recentlyViewed, compareList, favoritesLoading,
      addFavorite, removeFavorite, toggleFavorite, isFavorite,
      addRecentlyViewed, addToCompare, removeFromCompare, clearCompare, isInCompare,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) { throw new Error('useFavorites must be used within a FavoritesProvider'); }
  return context;
}