'use client';

/**
 * /search — 중개사 포털 (search-2026)
 *
 * 2026-05-22 P7 swap: 레거시 content.js(13,776줄) + 런타임 패치 84개 주입 방식 →
 *   search-2026 컴포넌트 구조로 교체. /search-preview 와 동일 앱 + 로그인 게이팅.
 *   · 멈춤 유발 런타임 패치 0 — React 컴포넌트 렌더.
 *   · 비로그인 → /login 리다이렉트 (중개사 전용 포털).
 *   · /search-preview 는 영구 시험장으로 유지.
 */

import { useEffect, useState } from 'react';
import { SearchHeader } from '@/features/search-2026/components/SearchHeader';
import { FilterBar } from '@/features/search-2026/components/FilterBar';
import { ResultsSplit } from '@/features/search-2026/components/ResultsSplit';
import { SearchFilterChips } from '@/features/search-2026/components/SearchFilterChips';
import { useSearchStore } from '@/features/search-2026/store';
import { useSearchListings } from '@/features/search-2026/hooks';
import { type SearchView } from '@/features/search-2026/components/ViewTabs';

type AuthState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [view, setView] = useState<SearchView>('split');
  const [qInput, setQInput] = useState('');
  const { filters, setFilter, reset } = useSearchStore();

  // 레거시 캐시 정리 (1회) — 구 content.js 시절 등록된 SW / Cache 비우기.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('ws_sw_cleaned') === '1') return;
      sessionStorage.setItem('ws_sw_cleaned', '1');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((regs) => regs.forEach((r) => { r.unregister().catch(() => {}); }))
          .catch(() => {});
      }
      if ('caches' in window) {
        caches.keys()
          .then((keys) => keys.forEach((k) => { caches.delete(k).catch(() => {}); }))
          .catch(() => {});
      }
    } catch { /* noop */ }
  }, []);

  // 로그인 게이팅 — ws_token 없으면 비로그인.
  useEffect(() => {
    try {
      let token = sessionStorage.getItem('ws_token');
      if (!token) {
        const lv = localStorage.getItem('ws_token');
        if (lv) {
          sessionStorage.setItem('ws_token', lv);
          const u = localStorage.getItem('ws_user');
          if (u) sessionStorage.setItem('ws_user', u);
          const t = localStorage.getItem('ws_login_time');
          if (t) sessionStorage.setItem('ws_login_time', t);
          token = lv;
        }
      }
      setAuth(token ? 'ok' : 'nosession');
    } catch {
      setAuth('nosession');
    }
  }, []);

  // 비로그인 → 로그인 페이지로 (레거시와 동일).
  useEffect(() => {
    if (auth === 'nosession' && typeof window !== 'undefined') {
      window.location.replace('/login?redirect=/search');
    }
  }, [auth]);

  // C-2: 검색창 입력은 로컬 state 만 갱신 → API 미발화.
  //   filters.q(검색 확정·초기화·칩 제거)가 바뀔 때만 입력칸 동기화.
  useEffect(() => { setQInput(filters.q ?? ''); }, [filters.q]);

  const {
    listings, total, fetchNextPage, hasNextPage, isFetchingNextPage, isError,
  } = useSearchListings(filters);

  if (auth !== 'ok') {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
          fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif",
          fontSize: 13,
          color: '#6b7570',
        }}
      >
        {auth === 'loading' ? '불러오는 중…' : '로그인 페이지로 이동 중…'}
      </div>
    );
  }

  // H-2: 인증 게이트는 통과했으나(ws_token 존재) 토큰 만료 등으로 목록 API 가
  //   401 실패 → 빈 화면 대신 명확한 재로그인 안내.
  if (isError) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard','Malgun Gothic',sans-serif",
          color: '#3a443d',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          세션이 만료되었어요. 다시 로그인해 주세요.
        </div>
        <a
          href="/login?redirect=/search"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 38,
            padding: '0 20px',
            borderRadius: 10,
            background: '#2c7a4b',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          다시 로그인
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard','Malgun Gothic',sans-serif",
      }}
    >
      <SearchHeader
        query={qInput}
        onQueryChange={setQInput}
        onReset={() => reset()}
        onSearch={(v) => setFilter('q', v)}
        view={view}
        onViewChange={setView}
      />
      <FilterBar />
      <SearchFilterChips />
      <ResultsSplit
        listings={listings}
        total={total}
        onLoadMore={() => { void fetchNextPage(); }}
        hasMore={!!hasNextPage}
        loadingMore={isFetchingNextPage}
      />
    </div>
  );
}
