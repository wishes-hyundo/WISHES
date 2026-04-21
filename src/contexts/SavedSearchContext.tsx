'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SavedSearchContext — 저장 검색 (Phase 1: localStorage 전용)
// 추후 Phase 2 에서 Supabase saved_searches 테이블과 동기화 예정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface SavedSearch {
  id: string;              // uuid-like random id
  label: string;           // 사용자가 볼 요약 레이블 (예: "봉천동 · 월세 · 2000만 이하")
  query: Record<string, string>; // URL query 파라미터 스냅샷
  createdAt: number;       // epoch ms
  notifyOnNew: boolean;    // Phase 2 에서 쓸 알림 플래그
}

interface SavedSearchContextType {
  searches: SavedSearch[];
  addSearch: (label: string, query: Record<string, string>) => SavedSearch;
  removeSearch: (id: string) => void;
  toggleNotify: (id: string) => void;
  isSaved: (query: Record<string, string>) => boolean;
}

const SavedSearchContext = createContext<SavedSearchContextType | undefined>(undefined);

const STORAGE_KEY = 'wishes_saved_searches';

function normalize(query: Record<string, string>) {
  // 빈 값 제거 + 키 정렬로 안정된 비교 가능하도록
  const out: Record<string, string> = {};
  Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== null && String(query[k]).length > 0)
    .sort()
    .forEach((k) => { out[k] = String(query[k]); });
  return out;
}

function signature(query: Record<string, string>): string {
  return JSON.stringify(normalize(query));
}

export function SavedSearchProvider({ children }: { children: ReactNode }) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSearches(JSON.parse(raw));
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(searches)); } catch {}
  }, [searches]);

  const addSearch = useCallback((label: string, query: Record<string, string>) => {
    const norm = normalize(query);
    const existing = searches.find((s) => signature(s.query) === signature(norm));
    if (existing) return existing;
    const next: SavedSearch = {
      id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      query: norm,
      createdAt: Date.now(),
      notifyOnNew: false,
    };
    setSearches((prev) => [next, ...prev].slice(0, 20)); // 최대 20개
    return next;
  }, [searches]);

  const removeSearch = useCallback((id: string) => {
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleNotify = useCallback((id: string) => {
    setSearches((prev) => prev.map((s) => (s.id === id ? { ...s, notifyOnNew: !s.notifyOnNew } : s)));
  }, []);

  const isSaved = useCallback((query: Record<string, string>) => {
    const sig = signature(query);
    return searches.some((s) => signature(s.query) === sig);
  }, [searches]);

  return (
    <SavedSearchContext.Provider value={{ searches, addSearch, removeSearch, toggleNotify, isSaved }}>
      {children}
    </SavedSearchContext.Provider>
  );
}

export function useSavedSearch() {
  const ctx = useContext(SavedSearchContext);
  if (!ctx) throw new Error('useSavedSearch must be used within a SavedSearchProvider');
  return ctx;
}
