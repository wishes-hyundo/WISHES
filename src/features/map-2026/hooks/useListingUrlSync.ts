// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useListingUrlSync — URL ↔ detailListingId 양방향 동기화 (path 형식)
//
// 사장님 명령 2026-04-29:
//   "wishes.co.kr/map/53190 이런식으로 매물카드 링크가 만들어지는거지"
//
// URL 형식 — path 우선:
//   /map/53190                   매물 53190 카드 오픈
//   /map/53190?cat=residence     매물 + 필터 공존 (filter query 보존)
//   /map                         매물 모달 닫힘
//
// middleware.ts 가 /map/<숫자> 진입 시 server-side 로 ?listing=<숫자> 로 rewrite.
// page.tsx 는 query 로 받아 처리. 클라이언트 진입 후 useListingUrlSync 가
// history.replaceState 로 path 형식 URL 노출 유지.
//
// 설계 원칙
//   1. detailListingId → URL: /map/<id> path 즉시 반영 (history.replaceState).
//      filter 등 다른 query string 보존.
//   2. URL → detailListingId: 페이지 진입 시 1회. path 형식 우선, query fallback.
//   3. closeListingDetail → /map (path 만 변경, query 보존).
//   4. popstate(back/forward) → URL 재수화.
//   5. useFilterUrlSync 와 분리 — listing 은 path, filter 는 query.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { useMap2026Store } from '../store';

const MAP_LISTING_PATH = /^\/map\/(\d+)$/;

function readListingFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  // path 형식 우선
  const m = MAP_LISTING_PATH.exec(window.location.pathname);
  let raw: string | null = m ? m[1] : null;
  // query 형식 fallback (이전 호환 + middleware rewrite 진입 직후)
  if (!raw) {
    const sp = new URLSearchParams(window.location.search);
    raw = sp.get('listing');
  }
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useListingUrlSync(): void {
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);
  const closeListingDetail = useMap2026Store((s) => s.closeListingDetail);

  const hydratedRef = useRef(false);

  // ─── 진입 시 URL → store 1회 수화 ────────────────────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const id = readListingFromUrl();
    if (id != null) openListingDetail(id);
    // openListingDetail deps 의도적 누락 — 1회 hydrate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── store → URL (즉시 반영, path 형식) ─────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === 'undefined') return;

    const m = MAP_LISTING_PATH.exec(window.location.pathname);
    const currentId = m ? m[1] : null;
    const nextId = detailListingId != null ? String(detailListingId) : null;
    if (currentId === nextId) return;

    // query 에 listing= 가 남아있을 수 있음 (이전 hydrate 직후) — 정리.
    const sp = new URLSearchParams(window.location.search);
    sp.delete('listing');

    const nextPath = nextId ? `/map/${nextId}` : '/map';
    const qs = sp.toString();
    const url = qs ? `${nextPath}?${qs}` : nextPath;
    // router.replace 대신 history.replaceState — Next.js router 는 RSC payload
    // 재페치 트리거 가능. listing 모달 토글은 클라이언트 전용이므로 history API
    // 직접 호출이 안전.
    window.history.replaceState(window.history.state, '', url);
  }, [detailListingId]);

  // ─── 브라우저 back/forward → store 재수화 ────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const id = readListingFromUrl();
      if (id != null) openListingDetail(id);
      else closeListingDetail();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openListingDetail, closeListingDetail]);
}
