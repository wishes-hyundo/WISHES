'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): SortMenu — 정렬 드롭다운
//   옛날 content.js 의 정렬 옵션 재현
//   최신/오래됨/가격↑↓/면적↑↓
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortKey =
  | 'updated_desc'
  | 'updated_asc'
  | 'price_desc'
  | 'price_asc'
  | 'area_desc'
  | 'area_asc';

export const SORT_LABELS: Record<SortKey, string> = {
  updated_desc: '최신순',
  updated_asc: '오래된순',
  price_desc: '가격 높은순',
  price_asc: '가격 낮은순',
  area_desc: '면적 큰순',
  area_asc: '면적 작은순',
};

export interface SortMenuProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  className?: string;
}

export function SortMenu({ value, onChange, className }: SortMenuProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <ArrowUpDown className="h-4 w-4 text-wishes-muted" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="bg-white border border-wishes-border rounded-md px-3 py-1.5 text-sm text-wishes-text focus:outline-none focus:ring-2 focus:ring-wishes-primary"
        aria-label="정렬"
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </div>
  );
}

// 클라이언트 정렬 헬퍼
export function sortListings<T extends { updated_at?: string; price?: number | null; deposit?: number | null; area_m2?: number | null }>(
  list: T[],
  key: SortKey
): T[] {
  const arr = [...list];
  switch (key) {
    case 'updated_desc':
      return arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    case 'updated_asc':
      return arr.sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || ''));
    case 'price_desc':
      return arr.sort((a, b) => (b.price ?? b.deposit ?? 0) - (a.price ?? a.deposit ?? 0));
    case 'price_asc':
      return arr.sort((a, b) => (a.price ?? a.deposit ?? 0) - (b.price ?? b.deposit ?? 0));
    case 'area_desc':
      return arr.sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
    case 'area_asc':
      return arr.sort((a, b) => (a.area_m2 ?? 0) - (b.area_m2 ?? 0));
    default:
      return arr;
  }
}
