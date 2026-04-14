'use client';

/**
 * /search — 중개사 포털
 *
 * 인증 흐름:
 *  1) /login 에서 Supabase 로그인 성공 시 sessionStorage 에 ws_token 저장
 *  2) 이 페이지는 ws_token 유무만 확인 (Supabase SDK 호출 없음 → 즉시 판단)
 *  3) 토큰 있으면 /search/content.js 로드 → 중개사 포털 표시
 *  4) 토큰 없으면 로그인 안내 화면 표시
 */

import { useEffect, useState } from 'react';

type PageState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [state, setState] = useState<PageState>('loading');

  // ── 인증 확인 (Supabase 호출 없음, 즉시 판단) ──
  useEffect(() => {
    try {
      const token = (sessionStorage.getItem('ws_token')||(function(){try{var _lv=localStorage.getItem('ws_token');if(_lv){sessionStorage.setItem('ws_token',_lv);var u=localStorage.getItem('ws_user');if(u)sessionStorage.setItem('ws_user',u);var t=localStorage.getItem('ws_login_time');if(t)sessionStorage.setItem('ws_login_time',t);var p=localStorage.getItem('admin_password');if(p)sessionStorage.setItem('admin_password',p);return _lv;}}catch(e){}return '';})());
      if (token) {
        setState('ok');
      } else {
        setState('nosession');
      }
    } catch {
      setState('nosession');
    }
  }, []);

  // ── 인증 통과 시: 카카오맵 사전 초기화 + 확장프로그램 CSS/JS 주입 ──
  useEffect(() => {
    if (state !== 'ok') return;

    // 매물 프리페치
    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        // /api/admin/listings 는 고정 관리자 토큰(wishes2026)만 허용
        // ws_token(Supabase JWT) 을 쓰면 401 이 발생하므로 하드코딩된 관리자 토큰 사용
        w.__WS_PREFETCH__ = fetch('/api/admin/listings?fields=minimal', {
          headers: { Authorization: 'Bearer wishes2026' },
          cache: 'no-cache',
        })
          .then((r) => r.json())
          .then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null))
          .catch(() => null);
      }
    } catch {}

    // 카카오맵 SDK 사전 초기화
    try {
      interface KakaoMaps { load: (cb: () => void) => void; Map?: unknown }
      interface KakaoGlobal { maps: KakaoMaps }
      const kk = (window as unknown as { kakao?: KakaoGlobal }).kakao;
      if (kk && kk.maps && typeof kk.maps.load === 'function' && !kk.maps.Map) {
        kk.maps.load(() => {});
      }
    } catch {}

    // CSS
    let link = document.getElementById('ws-ext-styles') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'ws-ext-styles';
      link.rel = 'stylesheet';
      link.href = '/search/styles.css';
      document.head.appendChild(link);
    }

    // JS
    const existing = document.getElementById('ws-ext-content') as HTMLScriptElement | null;
    if (existing) {
      try {
        const w = window as unknown as { WS?: { showSearchUI?: () => void; loadData?: () => void; _loadingData?: boolean; allListings?: unknown[] } };
        if (w.WS?.showSearchUI) w.WS.showSearchUI();
        if (w.WS?.loadData && !w.WS._loadingData && (!w.WS.allListings || w.WS.allListings.length === 0)) {
          w.WS.loadData();
        }
      } catch {}
      return;
    }
    const script = document.createElement('script');
    script.id = 'ws-ext-content';
    script.src = '/search/content.js';
    script.async = false;
    document.body.appendChild(script);
  }, [state]);

  // ========== UI ==========

  if (state === 'loading') {
    return (
      <div style={wrapStyle}>
        <div style={{ color: '#666' }}>로딩 중...</div>
      </div>
    );
  }

  if (state === 'nosession') {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>로그인이 필요합니다</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
            중개사 포털은 승인된 직원만 이용할 수 있습니다.<br />계정으로 로그인해주세요.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href="/login?redirect=/search" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>로그인</a>
            <a href="/signup" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>회원가입</a>
          </div>
        </div>
      </div>
    );
  }

  // state === 'ok' — content.js 가 #ws-search-overlay 를 document.body 에 직접 삽입
  return (
    <div id="ws-search-root" st