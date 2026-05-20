/**
 * search-2026 — 필터 상태 스토어 (Zustand)
 *
 * 레거시는 content.js 전역 state 객체 + 패치들이 제각각 건드려 멈춤의 한 축이 됐다.
 * 재구축은 단일 Zustand 스토어 하나로 필터 상태를 일원화한다.
 * 기준: ★search_완전기능명세서.md §2.
 */

'use client';

import { create } from 'zustand';
import { DEFAULT_FILTERS, type SearchFilters } from './types';

/** SearchFilters 중 다중선택(배열) 필드만 */
type ArrayFilterKey = 'types' | 'deals' | 'statuses' | 'roomCounts' | 'options' | 'regions' | 'dongs';

interface SearchStore {
  filters: SearchFilters;
  detailOpen: boolean;          // 상세 필터 펼침 여부
  /** 단일 값 필터 설정 */
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  /** 다중선택 필터의 값 1개 토글 */
  toggleValue: (key: ArrayFilterKey, value: string) => void;
  /** 상세 필터 패널 펼침/접힘 */
  toggleDetail: () => void;
  /** 전체 초기화 */
  reset: () => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  filters: { ...DEFAULT_FILTERS },
  detailOpen: false,

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  toggleValue: (key, value) =>
    set((s) => {
      const cur = (s.filters[key] as string[] | undefined) ?? [];
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      return { filters: { ...s.filters, [key]: next.length ? next : undefined } };
    }),

  toggleDetail: () => set((s) => ({ detailOpen: !s.detailOpen })),

  reset: () => set({ filters: { ...DEFAULT_FILTERS }, detailOpen: false }),
}));
