'use client';

/**
 * SearchFilterChips — 활성(적용된) 필터 칩 (명세서 §3-5)
 *
 * 현재 적용된 필터를 칩으로 보여주고 개별 ✕ 로 해제. 전체 해제도 제공.
 * Zustand 스토어를 직접 읽고 갱신 — 부모 배선 불필요.
 */

import { FILTER_OPTIONS, type SearchFilters } from '../types';
import { useSearchStore } from '../store';
import styles from './SearchFilterChips.module.css';

type Chip = { id: string; label: string; remove: () => void };

type ArrKey = 'regions' | 'dongs' | 'types' | 'deals' | 'statuses' | 'roomCounts' | 'options';

const RANGES: Array<{ label: string; min: keyof SearchFilters; max: keyof SearchFilters; unit: string }> = [
  { label: '보증금', min: 'minDeposit', max: 'maxDeposit', unit: '만' },
  { label: '월세', min: 'minMonthly', max: 'maxMonthly', unit: '만' },
  { label: '매매가', min: 'minSale', max: 'maxSale', unit: '만' },
  { label: '기준가', min: 'minBase', max: 'maxBase', unit: '만' },
  { label: '전용면적', min: 'minArea', max: 'maxArea', unit: '㎡' },
  { label: '공급면적', min: 'minSupply', max: 'maxSupply', unit: '㎡' },
];
const STR_FIELDS: Array<[keyof SearchFilters, string]> = [
  ['q', '검색'], ['keyword', '특이사항'], ['roomShape', '룸형태'],
  ['floorType', '층'], ['buildingName', '건물명'],
];
const NUM_FIELDS: Array<[keyof SearchFilters, string, string]> = [
  ['builtYearMin', '준공', '년 이후'], ['builtYearMax', '준공', '년 이전'],
  ['bathroomsMin', '욕실', '개 이상'], ['parkingMin', '주차', '대 이상'],
];

const OPT_LABEL: Record<string, string> = Object.fromEntries(
  FILTER_OPTIONS.options.map((o) => [o.key, o.label]),
);

export function SearchFilterChips() {
  const filters = useSearchStore((s) => s.filters);
  const setFilter = useSearchStore((s) => s.setFilter);
  const toggleValue = useSearchStore((s) => s.toggleValue);
  const reset = useSearchStore((s) => s.reset);

  const chips: Chip[] = [];

  (['regions', 'dongs', 'types', 'deals', 'statuses', 'roomCounts', 'options'] as ArrKey[])
    .forEach((key) => {
      const vals = (filters[key] as string[] | undefined) ?? [];
      vals.forEach((v) => {
        chips.push({
          id: `${key}:${v}`,
          label: key === 'options' ? (OPT_LABEL[v] ?? v) : v,
          remove: () => toggleValue(key, v),
        });
      });
    });

  RANGES.forEach(({ label, min, max, unit }) => {
    const lo = filters[min] as number | undefined;
    const hi = filters[max] as number | undefined;
    if (lo == null && hi == null) return;
    const txt = `${label} ${lo != null ? lo.toLocaleString() : ''}~${hi != null ? hi.toLocaleString() : ''}${unit}`;
    chips.push({
      id: `range:${String(min)}`,
      label: txt,
      remove: () => { setFilter(min, undefined); setFilter(max, undefined); },
    });
  });

  STR_FIELDS.forEach(([key, label]) => {
    const v = filters[key] as string | undefined;
    if (v && String(v).trim()) {
      chips.push({ id: `s:${String(key)}`, label: `${label}: ${v}`, remove: () => setFilter(key, undefined) });
    }
  });

  NUM_FIELDS.forEach(([key, label, suffix]) => {
    const v = filters[key] as number | undefined;
    if (v != null) {
      // builtYearMax 는 (연도-1) 규약 — 칩 표기는 +1 하여 FilterBar 와 일치시킨다.
      const shown = key === 'builtYearMax' ? v + 1 : v;
      chips.push({ id: `n:${String(key)}`, label: `${label} ${shown}${suffix}`, remove: () => setFilter(key, undefined) });
    }
  });

  if (filters.includeMgmt) {
    chips.push({ id: 'includeMgmt', label: '관리비 포함', remove: () => setFilter('includeMgmt', undefined) });
  }
  if (filters.scope === 'mine') {
    chips.push({ id: 'scope', label: '내 매물만', remove: () => setFilter('scope', 'all') });
  }

  if (chips.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {chips.map((c) => (
        <span key={c.id} className={styles.chip}>
          {c.label}
          <button type="button" className={styles.x} onClick={c.remove} aria-label={`${c.label} 해제`}>✕</button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" className={styles.clearAll} onClick={reset}>전체 해제</button>
      )}
    </div>
  );
}

export default SearchFilterChips;
