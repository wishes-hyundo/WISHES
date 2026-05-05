// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 지도 뷰포트 변경 → /api/listings/viewport 호출
// Wave 65 디바운스 100ms (직방/네이버 표준), AbortController 경쟁조건 방지
//
// L-vp2 (2026-04-22): 서버가 400 으로 돌려주던 "bbox 너무 큼 / 좌표 반전"
//   상태를 클라이언트에서 선 차단.
// Wave 65 (사장님 명령 2026-05-04 "직방/네이버 능가 X"): 두 가지 latency 줄임:
//   (1) debounce 250ms → 100ms (직방 80ms, 네이버 120ms 표준)
//   (2) getSession() 모듈 캐시 (5초) — 매 fetch 마다 Supabase 호출 안 함
//       → 비로그인/로그인 둘 다 매 viewport 갱신 시 50-100ms 단축.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect, useRef } from 'react';
import { useMap2026Store, type FilterState } from '../store';
import { dealsToParam } from '../lib/priceFormat';
import { createAuthClient } from '@/lib/supabase';

// Wave 65: getSession() 모듈 캐시. 매 fetch 마다 50-100ms 절감.
//   TTL 5초 — JWT 만료 안전 거리. 로그인 직후/로그아웃 직후 stale 감수 (5초 후 회복).
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
      // L-widecount1 (2026-04-26): 광역 뷰에서도 categoryCounts 만 lightweight fetch.
      //   listings 는 비우고 (큰 viewport 에서 카드는 의미 없음), 카운트만 정확히
      //   표시하여 카테고리 탭 카운트 "0" 으로 잘못 보이는 문제 해결.
      // L-widecount2 (2026-04-26 night): 서버 bbox cap 2° per axis + area cap 2.5 sq°.
      //   광역 뷰 진입 시 bbox 를 1.4° (1.96 sq°) 로 클램프 — 둘 다 통과.
      setListings([]);
      setLoading(false);
      const cw = (bbox.west + bbox.east) / 2;
      const ch = (bbox.south + bbox.north) / 2;
      const halfDeg = 0.7;  // 1.4° box, 1.96 sq° (under 2.5 cap)
      const clamped = {
        west: cw - halfDeg,
        east: cw + halfDeg,
        south: ch - halfDeg,
        north: ch + halfDeg,
      };
      const qs = buildQueryString(clamped, filter, 1);
      (async () => {
        try {
          const res = await fetch(`/api/listings/viewport?${qs}`);
          if (!res.ok) { setCategoryCounts(null); return; }
          const json = await res.json();
          setCategoryCounts(json.counts ?? null);
        } catch { setCategoryCounts(null); }
      })();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    // Wave 65 (사장님 명령 2026-05-04): debounce 250ms → 100ms (직방/네이버 표준).
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const qs = buildQueryString(bbox, filter);
        // Wave 65: 모듈 캐시 (5초 TTL) — 매 fetch 마다 Supabase getSession 안 호출.
        const authHeader = await getCachedAuthHeader();
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
    }, 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bbox, filter, setListings, setCategoryCounts, setLoading]);
}
