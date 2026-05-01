'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SavedSearchContext — 저장 검색 (Phase 1: localStorage 전용)
// 추후 Phase 2 에서 Supabase saved_searches 테이블과 동기화 예정
//
// L-sec170 (2026-05-02, PR-S4 P1): silent drop 제거.
//   기존 .slice(0, 20) 패턴은 21번째 추가 시 가장 오래된 1개를 조용히 삭제 →
//   사용자는 무엇이 사라졌는지 모름. addSearch 반환 type 을
//   `SavedSearch | null` 로 변경: limit 도달 시 null 반환 → caller 가 toast/alert
//   로 명시적 안내 가능.
//   기존 caller (ListingsClient.tsx:415) 는 반환값 무시하므로 동작 영향 없음.
//   향후 새 caller 는 null 처리로 UX 개선 가능.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface SavedSearch {
  id: string;              // uuid-like random id
  label: string;           // 사용자가 볼 요약 레이블 (예: "봉천동 · 월세 · 2000만 이하")
  query: Record<string, string>; // URL query 파라미터 스냅샷
  createdAt: number;       // epoch ms
  notifyOnNew: boolean;    // Phase 2 에서 쓸 알림 플래그
}

// L-sec170: limit 상수 export — caller 가 미리 체크 가능
export const MAX_SAVED_SEARCHES = 20;

interface SavedSearchContextType {
  searches: SavedSearch[];
  /**
   * 검색 조건 저장.
   * @returns 저장된 SavedSearch (기존 항목 또는 신규). limit({@link MAX_SAVED_SEARCHES}) 도달 시 `null`.
   */
  addSearch: (label: string, query: Record<string, string>) => SavedSearch | null;
  removeSearch: (id: string) => void;
  toggleNotify: (id: string) => void;
  isSaved: (query: Record<string, string>) => boolean;
  /** 현재 저장 가능한 잔여 슬롯 (0 ~ MAX_SAVED_SEARCHES) */
  remainingSlots: number;
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
      if (raw) {
        const parsed = JSON.parse(raw);
        // L-sec170: 외부 입력이라 hard cap 적용 (조작된 localStorage 방어)
        if (Array.isArray(parsed)) {
          setSearches(parsed.slice(0, MAX_SAVED_SEARCHES));
        }
      }
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

    // L-sec170 (PR-S4): limit 도달 시 silent drop 대신 null 반환.
    //   caller 가 toast/alert 로 사용자에게 명시적으로 안내 가능.
    if (searches.length >= MAX_SAVED_SEARCHES) {
      return null;
    }

    const next: SavedSearch = {
      id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      query: norm,
      createdAt: Date.now(),
      notifyOnNew: false,
    };
    setSearches((prev) => [next, ...prev]);
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

  const remainingSlots = Math.max(0, MAX_SAVED_SEARCHES - searches.length);

  return (
    <SavedSearchContext.Provider value={{ searches, addSearch, removeSearch, toggleNotify, isSaved, remainingSlots }}>
      {children}
    </SavedSearchContext.Provider>
  );
}

export function useSavedSearch() {
  const ctx = useContext(SavedSearchContext);
  if (!ctx) throw new Error('useSavedSearch must be used within a SavedSearchProvider');
  return ctx;
}
