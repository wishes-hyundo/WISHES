// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useListingUrlSync — URL ↔ detailListingId 양방향 동기화
//
// 사장님 명령 2026-04-29:
//   "매물카드에 맞는 링크주소가 있어야된다 — wishes.co.kr/map?listing=53190 같이"
//
// 설계 원칙
//   1. detailListingId → URL: 매물 클릭 시 `?listing=ID` 즉시 추가 (replaceState).
//      closeListingDetail → `listing` 파라미터만 제거 (다른 필터 보존).
//   2. URL → detailListingId: 페이지 진입 시 1회. `?listing=ID` 있으면
//      openListingDetail(ID) 호출. listings 에 해당 매물이 없으면
//      ListingDetailModal 이 /api/listings/[id] 로 fetch (기존 동작).
//   3. 브라우저 back/forward(popstate): URL → store 재수화.
//   4. useFilterUrlSync 와 분리 — filter 는 debounce 300ms 지만 listing 은
//      즉시(0ms). 다른 파라미터에 영향 안 줌.
//
// URL 스키마
//   /map?listing=53190                    매물 모달만
//   /map?cat=residence&listing=53190      필터 + 매물 모달 공존
//   /map?listing=                         빈 값 = 무시
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { useMap2026Store } from '../store';

export function useListingUrlSync(): void {
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);
  const closeListingDetail = useMap2026Store((s) => s.closeListingDetail);

  const hydratedRef = useRef(false);

  // ─── 진입 시 URL → store 1회 수화 ────────────────────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === 'undefined') return;

    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('listing');
    if (!raw) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) return;

    // listings 가 viewport 기반으로 비어있을 수 있음 — store 의 detailListing 은 null 이지만
    // ListingDetailModal 이 /api/listings/[id] 로 fetch 하므로 정보는 정상 표시됨.
    openListingDetail(id);
    // openListingDetail deps 는 의도적 누락 — 1회 hydrate 만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── store → URL (즉시 반영, replaceState) ──────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === 'undefined') return;

    const sp = new URLSearchParams(window.location.search);
    const current = sp.get('listing');
    const next = detailListingId != null ? String(detailListingId) : null;

    if (current === next) return; // 동일 — replaceState 생략

    if (next) {
      sp.set('listing', next);
    } else {
      sp.delete('listing');
    }
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    // router.replace 대신 history.replaceState — Next.js router 는 RSC payload 재페치
    // 트리거 가능. listing 모달 토글은 클라이언트 전용이므로 history API 직접 호출이 안전.
    window.history.replaceState(window.history.state, '', url);
  }, [detailListingId]);

  // ─── 브라우저 back/forward → store 재수화 ────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('listing');
      if (!raw) {
        closeListingDetail();
        return;
      }
      const id = Number.parseInt(raw, 10);
      if (!Number.isFinite(id) || id <= 0) {
        closeListingDetail();
        return;
      }
      openListingDetail(id);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openListingDetail, closeListingDetail]);
}
