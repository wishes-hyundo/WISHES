// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 지도 뷰포트 변경 → /api/listings/viewport 호출
// 디바운스 250ms, AbortController 로 경쟁조건 방지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect, useRef } from 'react';
import { useMap2026Store, type FilterState } from '../store';
import { dealsToParam } from '../lib/priceFormat';

function buildQueryString(
  bbox: NonNullable<ReturnType<typeof useMap2026Store.getState>['bbox']>,
  filter: FilterState,
  limit = 800
) {
  const p = new URLSearchParams();
  p.set('west', bbox.west.toFixed(6));
  p.set('south', bbox.south.toFixed(6));
  p.set('east', bbox.east.toFixed(6));
  p.set('north', bbox.north.toFixed(6));
  p.set('limit', String(limit));

  // Category-First — 최상위 맥락
  p.set('category', filter.category);
  if (filter.purposes.length) p.set('purposes', filter.purposes.join(','));

  const deals = dealsToParam(filter.deals);
  if (deals) p.set('deals', deals);
  if (filter.minPrice != null) p.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice != null) p.set('maxPrice', String(filter.maxPrice));
  if (filter.minDeposit != null) p.set('minDeposit', String(filter.minDeposit));
  if (filter.maxDeposit != null) p.set('maxDeposit', String(filter.maxDeposit));
  if (filter.minMonthly != null) p.set('minMonthly', String(filter.minMonthly));
  if (filter.maxMonthly != null) p.set('maxMonthly', String(filter.maxMonthly));
  if (filter.minArea != null) p.set('minArea', String(filter.minArea));
  if (filter.maxArea != null) p.set('maxArea', String(filter.maxArea));
  if (filter.rooms.length) p.set('rooms', filter.rooms.join(','));
  if (filter.nearStation != null) p.set('nearStation', String(filter.nearStation));
  if (filter.newBuildYears != null) p.set('newBuild', String(filter.newBuildYears));
  if (filter.propertyTypes.length) p.set('types', filter.propertyTypes.join(','));
  if (filter.features.length) p.set('features', filter.features.join(','));
  if (filter.hasImages) p.set('hasImages', '1');

  return p.toString();
}

export function useViewport() {
  const bbox = useMap2026Store((s) => s.bbox);
  const filter = useMap2026Store((s) => s.filter);
  const setListings = useMap2026Store((s) => s.setListings);
  const setLoading = useMap2026Store((s) => s.setLoading);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bbox) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const qs = buildQueryString(bbox, filter);
        const res = await fetch(`/api/listings/viewport?${qs}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`viewport ${res.status}`);
        const json = await res.json();
        if (!ctrl.signal.aborted) setListings(json.listings ?? []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[useViewport]', err);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bbox, filter, setListings, setLoading]);
}
