// 지도 뷰포트 변경 -> /api/listings/viewport 호출
// Wave 66 (사장님 명령 2026-05-04 ~ 05): debounce 100ms + getSession cache + race
//
// L-vp2 (2026-04-22): 서버가 400 으로 돌려주던 "bbox 너무 큼 / 좌표 반전"
//   상태를 클라이언트에서 선 차단.
// Wave 66 fix:
//   (1) R-B1: debounce 250ms -> 100ms (직방/네이버 표준)
//   (2) R-B2: getSession() 모듈 캐시 5초 TTL
//   (3) R-Cs2: race condition 강화 — abortRef.current 직접 비교로 stale 응답 차단
//   (4) R-B5: 광역 뷰 fetch 도 abort/auth/race 통합 — 빈 패널 깜박임 제거
import { useEffect, useRef } from 'react';
import { useMap2026Store, type FilterState } from '../store';
import { dealsToParam } from '../lib/priceFormat';
import { createAuthClient } from '@/lib/supabase';

// Wave 66 (R-B2): getSession() 모듈 캐시 — 매 fetch 마다 50-100ms 절감.
//   TTL 5초 — JWT 만료 안전 거리.
let _sessionCache: { token: string | null; ts: number } | null = null;
const SESSION_CACHE_TTL_MS = 5000;
async function getCachedAuthHeader(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_sessionCache && (now - _sessionCache.ts) < SESSION_CACHE_TTL_MS) {
    return _sessionCache.token ? { Authorization: `Bearer ${_sessionCache.token}` } : {};
  }
  try {
    const sb = createAuthClient();
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token ?? null;
    _sessionCache = { token, ts: now };
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    _sessionCache = { token: null, ts: now };
    return {};
  }
}

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
  limit = 50  // Wave 70 (I-ARCH-3): visible viewport list 50개
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

    if (!isValidBbox(bbox)) {
      // Wave 66 (R-B5): 광역 뷰도 abort/auth/race 통합.
      setLoading(false);
      const cw = (bbox.west + bbox.east) / 2;
      const ch = (bbox.south + bbox.north) / 2;
      const halfDeg = 0.7;
      const clamped = {
        west: cw - halfDeg,
        east: cw + halfDeg,
        south: ch - halfDeg,
        north: ch + halfDeg,
      };
      const qs = buildQueryString(clamped, filter, 1);
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const myCtrl = ctrl;
      (async () => {
        try {
          const authHeader = await getCachedAuthHeader();
          if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
          const res = await fetch(`/api/listings/page?${qs}`, { signal: myCtrl.signal, headers: authHeader });
          if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
          if (!res.ok) {
            setCategoryCounts(null);
            setListings([]);
            return;
          }
          const json = await res.json();
          if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
          setCategoryCounts(json.counts ?? null);
          setListings([]);
        } catch (err) {
          if ((err as Error).name !== 'AbortError' && abortRef.current === myCtrl) {
            setCategoryCounts(null);
            setListings([]);
          }
        }
      })();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    // Wave 66 (R-B1): debounce 250ms -> 100ms.
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const myCtrl = ctrl;

      setLoading(true);
      try {
        const qs = buildQueryString(bbox, filter);
        const authHeader = await getCachedAuthHeader();
        if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
        const res = await fetch(`/api/listings/page?${qs}`, { signal: myCtrl.signal, headers: authHeader });
        if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
        if (res.status >= 400 && res.status < 500) {
          setListings([]);
          if (res.status !== 400) console.warn('[useViewport] non-400 4xx', res.status);
          return;
        }
        if (!res.ok) throw new Error(`viewport ${res.status}`);
        const json = await res.json();
        if (myCtrl.signal.aborted || abortRef.current !== myCtrl) return;
        setListings(json.listings ?? []);
        setCategoryCounts(json.counts ?? null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[useViewport]', err);
        }
      } finally {
        if (abortRef.current === myCtrl) setLoading(false);
      }
    }, 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bbox, filter, setListings, setCategoryCounts, setLoading]);
}
