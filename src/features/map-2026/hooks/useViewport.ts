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
// L-privacy1 (2026-04-23 p.m.): 서버에서 비로그인 사용자 주소를 마스킹
//   하려면 클라이언트가 현재 세션 JWT 를 Authorization 으로 넘겨야 한다.
//   createAuthClient 는 브라우저 싱글턴이므로 매 호출마다 재초기화 비용
//   없이 session 을 가져올 수 있다.
import { createAuthClient } from '@/lib/supabase';

// L-nolimit1 (2026-04-26): bbox 가 동 단위 (≤ 0.3°) 이하일 때만 listings fetch.
//   광역 뷰 (구/시도) 에선 마커는 serverClusters 로 충분, 카드는 의미 없음.
//   사이드바 총합은 categoryCounts (서버 정확 집계) 으로 표시됨.
//   동 단위 viewport 안에서는 매물 수가 자연스럽게 적어 limit 불필요.
const MAX_VIEWPORT_DEG = 0.3;

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
  // L-nolimit1 (2026-04-26): limit 제거.  bbox 가 ≤ 0.3° 일 때만 listings 를
  //   fetch 하므로 (위 isValidBbox), 동 단위 viewport 에서는 자연스럽게 매물
  //   수가 수백~수천 단위.  넓은 viewport 에선 fetch 자체가 차단됨.
  //   사이드바 총합은 categoryCounts (서버 정확 집계) 으로 표시.
  //   10만 매물 추가되어도 동 단위 viewport 안에는 일부만 들어옴.
  limit = 100000
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
  const setCategoryCounts = useMap2026Store((s) => s.setCategoryCounts);
  const setLoading = useMap2026Store((s) => s.setLoading);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bbox) return;
    // L-nolimit2 (2026-04-26): 광역 뷰 (>0.3°) 진입 시 listings/categoryCounts 를
    //   명시적으로 reset.  이전 cached 값이 남아 사이드바에 stale 카드/카운트가
    //   표시되던 문제 해결.
    if (!isValidBbox(bbox)) {
      setListings([]);
      setCategoryCounts(null);
      setLoading(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const qs = buildQueryString(bbox, filter);
        // L-privacy1: 세션 JWT 를 서버에 전달해 authed 판정을 받는다.
        //   미로그인 시 access_token 이 undefined 라서 헤더 생략 → 서버 guest 처리.
        let authHeader: Record<string, string> = {};
        try {
          const sb = createAuthClient();
          const { data: { session } } = await sb.auth.getSession();
          if (session?.access_token) authHeader = { Authorization: `Bearer ${session.access_token}` };
        } catch { /* guest 로 폴백 */ }
        const res = await fetch(`/api/listings/viewport?${qs}`, { signal: ctrl.signal, headers: authHeader });
        if (res.status >= 400 && res.status < 500) {
          if (!ctrl.signal.aborted) setListings([]);
          if (res.status !== 400) {
            console.warn('[useViewport] non-400 4xx', res.status);
          }
          return;
        }
        if (!res.ok) throw new Error(`viewport ${res.status}`);
        const json = await res.json();
        if (!ctrl.signal.aborted) {
          setListings(json.listings ?? []);
          // L-catcount1: 서버가 4개 카테고리 count 도 함께 반환 (옵셔널)
          setCategoryCounts(json.counts ?? null);
        }
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
  }, [bbox, filter, setListings, setCategoryCounts, setLoading]);
}
