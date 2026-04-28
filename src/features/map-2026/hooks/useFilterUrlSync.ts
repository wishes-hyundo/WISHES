// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useFilterUrlSync — URL ↔ FilterState 양방향 동기화
// (v7 핸드오프 §5 URL 딥링크 — Phase 1)
//
// 설계 원칙
//   1. Store가 단일 진리원(single source of truth). URL은 debounced 반영.
//   2. 페이지 진입 시 1회: URL → store (hydrate).
//   3. 이후 store 변경 시: store → URL (replaceState, 300ms debounce).
//   4. 브라우저 back/forward(popstate): URL → store 재수화.
//   5. 쿼리 누락 = 기본값. 기본값인 키는 URL에서 제외(짧은 URL).
//
// URL 파라미터 스키마 (v7 §5)
//   cat=residence|retail_office|land|investment
//   deals=매매,전세,월세,단기
//   purposes=retail,office,knowledge_center,coworking,mixed_use
//   rooms=1,2,3        // 3 = 쓰리룸+
//   types=원룸,투룸,...
//   features=반려동물,엘리베이터,...
//   priceMin/priceMax/depositMin/depositMax/monthlyMin/monthlyMax
//   areaMin/areaMax
//   near=600           // 역까지 초(秒)
//   new=5              // 신축 N년 이내
//   photos=1           // 사진 있음
//   sort=recent|price_asc|price_desc|area_desc|deal_score
//   q=원문자연어검색
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useMap2026Store,
  DEFAULT_FILTER,
  type FilterState,
  type PropertyCategory,
  type CommercialPurpose,
  type DealType,
  type SortKey,
} from '../store';

const CATEGORIES: PropertyCategory[] = ['residence', 'retail_office', 'land', 'investment'];
const DEALS: DealType[] = ['매매', '전세', '월세', '단기'];
const PURPOSES: CommercialPurpose[] = ['retail', 'office', 'knowledge_center', 'coworking', 'mixed_use'];
const SORTS: SortKey[] = ['recent', 'price_asc', 'price_desc', 'area_desc', 'deal_score'];

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

function parseInts(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function parseInt1(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseStrList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// URL → FilterState
export function paramsToFilter(sp: URLSearchParams): FilterState {
  const category = (() => {
    const raw = sp.get('cat');
    return raw && (CATEGORIES as readonly string[]).includes(raw)
      ? (raw as PropertyCategory)
      : DEFAULT_FILTER.category;
  })();

  return {
    category,
    deals: parseList(sp.get('deals'), DEALS),
    purposes: category === 'retail_office' ? parseList(sp.get('purposes'), PURPOSES) : [],
    rooms: category === 'residence' ? parseInts(sp.get('rooms')).filter((n) => n >= 1 && n <= 9) : [],
    propertyTypes: parseStrList(sp.get('types')),
    features: parseStrList(sp.get('features')),
    minPrice: parseInt1(sp.get('priceMin')),
    maxPrice: parseInt1(sp.get('priceMax')),
    minDeposit: parseInt1(sp.get('depositMin')),
    maxDeposit: parseInt1(sp.get('depositMax')),
    minMonthly: parseInt1(sp.get('monthlyMin')),
    maxMonthly: parseInt1(sp.get('monthlyMax')),
    minArea: parseInt1(sp.get('areaMin')),
    maxArea: parseInt1(sp.get('areaMax')),
    nearStation: parseInt1(sp.get('near')),
    newBuildYears: parseInt1(sp.get('new')),
    hasImages: sp.get('photos') === '1',
  };
}

// FilterState → URL (기본값은 생략)
export function filterToParams(
  f: FilterState,
  extras?: { sort?: SortKey; nlQuery?: string }
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.category !== DEFAULT_FILTER.category) sp.set('cat', f.category);
  if (f.deals.length > 0) sp.set('deals', f.deals.join(','));
  if (f.purposes.length > 0) sp.set('purposes', f.purposes.join(','));
  if (f.rooms.length > 0) sp.set('rooms', f.rooms.join(','));
  if (f.propertyTypes.length > 0) sp.set('types', f.propertyTypes.join(','));
  if (f.features.length > 0) sp.set('features', f.features.join(','));
  if (f.minPrice != null) sp.set('priceMin', String(f.minPrice));
  if (f.maxPrice != null) sp.set('priceMax', String(f.maxPrice));
  if (f.minDeposit != null) sp.set('depositMin', String(f.minDeposit));
  if (f.maxDeposit != null) sp.set('depositMax', String(f.maxDeposit));
  if (f.minMonthly != null) sp.set('monthlyMin', String(f.minMonthly));
  if (f.maxMonthly != null) sp.set('monthlyMax', String(f.maxMonthly));
  if (f.minArea != null) sp.set('areaMin', String(f.minArea));
  if (f.maxArea != null) sp.set('areaMax', String(f.maxArea));
  if (f.nearStation != null) sp.set('near', String(f.nearStation));
  if (f.newBuildYears != null) sp.set('new', String(f.newBuildYears));
  if (f.hasImages) sp.set('photos', '1');
  if (extras?.sort && extras.sort !== 'recent') sp.set('sort', extras.sort);
  if (extras?.nlQuery && extras.nlQuery.trim()) sp.set('q', extras.nlQuery.trim());
  return sp;
}

// 2개 URLSearchParams 이 동일 직렬화를 내는지 비교(키 순서 무관)
function paramsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  const aEntries = [...a.entries()].sort(([k1], [k2]) => k1.localeCompare(k2));
  const bEntries = [...b.entries()].sort(([k1], [k2]) => k1.localeCompare(k2));
  if (aEntries.length !== bEntries.length) return false;
  return aEntries.every(([k, v], i) => bEntries[i][0] === k && bEntries[i][1] === v);
}

// L-listingurl1 (2026-04-29): filter sync 가 다루는 키 목록.
//   merge 시 이 키들만 지우고 나머지(listing 등)는 보존.
const FILTER_KEYS = [
  'cat', 'deals', 'purposes', 'rooms', 'types', 'features',
  'priceMin', 'priceMax', 'depositMin', 'depositMax', 'monthlyMin', 'monthlyMax',
  'areaMin', 'areaMax', 'near', 'new', 'photos', 'sort', 'q',
] as const;

/**
 * useFilterUrlSync — 한 번만 호출하세요 (최상위 페이지 컴포넌트에서).
 *
 * @param debounceMs URL 업데이트 debounce(기본 300ms). 타이핑/슬라이더 연속 변경 시
 *                    replaceState 폭주를 방지합니다.
 */
export function useFilterUrlSync(debounceMs = 300): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = useMap2026Store((s) => s.filter);
  const sort = useMap2026Store((s) => s.sort);
  const nlQuery = useMap2026Store((s) => s.nlQuery);
  const setFilter = useMap2026Store((s) => s.setFilter);
  const setSort = useMap2026Store((s) => s.setSort);
  const setNlQuery = useMap2026Store((s) => s.setNlQuery);

  const hydratedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 진입 시 URL → store 1회 수화 ────────────────────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    const next = paramsToFilter(sp);
    setFilter(next);

    const sortRaw = sp.get('sort');
    if (sortRaw && (SORTS as readonly string[]).includes(sortRaw)) {
      setSort(sortRaw as SortKey);
    }
    const q = sp.get('q');
    if (q) setNlQuery(q);
    // searchParams deps 의도적 누락 — 최초 1회만 수화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── store → URL (debounced) ────────────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const nextFilterParams = filterToParams(filter, { sort, nlQuery });
      // L-listingurl1 (2026-04-29): listing 등 filter 외 파라미터 보존.
      //   기존 URL 에서 filter 키만 지우고 새 값으로 덮어쓴 뒤 비교.
      const merged = new URLSearchParams(window.location.search);
      FILTER_KEYS.forEach((k) => merged.delete(k));
      nextFilterParams.forEach((v, k) => merged.set(k, v));

      const currentParams = new URLSearchParams(window.location.search);
      if (paramsEqual(merged, currentParams)) return;

      const qs = merged.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(nextUrl, { scroll: false });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [filter, sort, nlQuery, pathname, router, 