// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 지도 뷰포트 변경 → /api/listings/viewport 호출
// 디바운스 250ms, AbortController 로 경쟁조건 방지
//
// L-vp2 (2026-04-22): 서버가 400 으로 돌려주던 "bbox 너무 큼 / 좌표 반전"
//   상태를 클라이언트에서 선 차단. 이전에는 Kakao 초기 idle 이벤트가 간혹
//   SW=NE 로 들어와 console 에 `viewport 400` 을 남기고 빈 리스트가 깜박거렸음.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect, useRef } from 'react';
import { useMap2026Store, type FilterState } from '../store';
import { dealsToParam } from '../lib/priceFormat';

const MAX_VIEWPORT_DEG = 2;

function isValidBbox(b: { west: number; south: number; east: number; north: number }): boolean {
  if (![b.west, b.south, b.east, b.north].every(Number.isFinite)) return false;
  if (b.east <= b.west || b.north <= b.south) return false;
  if (b.east - b.west > MAX_VIEWPORT_DEG) return false;
  if (b.north - b.south > MAX_VIEWPORT_DEG) return false;
  return true;
}

function buildQueryString(
  bbox: NonNullable<ReturnType<typeof useMap2026Store.getState>['bbox']>,
  filter: FilterState,
  // L-viewport1 (2026-04-23): 6000+ 매물 전부 수신을 위해 800 → 3000.
  // L-viewport2 (2026-04-23 p.m.): DB 실측 mv_visible=6179 → 3000 cap 으로 여전히
  //   절반 넘게 잘려 ListPanel 카운트가 "3,000개" 로 고정되어 있었다. 서버
  //   MAX_LIMIT=10000 을 풀수신하도록 상향. 클라이언트 grid clustering 덕에
  //   rendering cost 는 매물 수와 무관하게 클러스터 개수만큼만 발생한다.
  limit = 10000
) {
  const p = new URLSearchParams();
  p.set('west', bbox.west.toFixed(6));
  p.set('south', bbox.south.toFixed(6));
  p.set('east', bbox.east.toFixed(6));
  p.set('north', bbox.north.toFixed(6));
  p.set('limit', String(limit));

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
    if (!isValidBbox(bbox)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const qs = buildQueryString(bbox, filter);
        const res = await fetch(`/api/listings/viewport?${qs}`, { signal: ctrl.signal });
        if (res.status >= 400 && res.status < 500) {
          if (!ctrl.signal.aborted) setListings([]);
          if (res.status !== 400) {
            console.warn('[useViewport] non-400 4xx', res.status);
          }
          return;
        }
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
