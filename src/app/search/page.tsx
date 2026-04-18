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

import React, { useEffect, useState } from 'react';

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

    // v2.3.0 UI/UX 개선 패치 로드 (content.js 뒤에 순차 실행)
    // 기존 content.js 는 수정하지 않고, window.WS 가 준비된 뒤 래핑/덮어쓰는 안전 패턴
    const existingPatch = document.getElementById('ws-ext-patch');
    if (!existingPatch) {
      const patchScript = document.createElement('script');
      patchScript.id = 'ws-ext-patch';
      patchScript.src = '/search/content-v230-patch.js?v=20260502';
      patchScript.async = false;
      patchScript.defer = false;
      document.body.appendChild(patchScript);
    }

    // v2.4.0 상세보기 단일스크롤 재구성 패치 로드 (v230 패치 뒤에 순차 실행)
    // 상세보기 모달을 기존 5탭 구조에서 단일 스크롤 6섹션 구조로 교체
    // (갤러리 → 히어로 → 기본정보·옵션 → 위치 → 유사매물 → 중개사전용)
    const existingV240 = document.getElementById('ws-ext-patch-v240');
    if (!existingV240) {
      const v240Script = document.createElement('script');
      v240Script.id = 'ws-ext-patch-v240';
      v240Script.src = '/search/content-v240-detail.js?v=20260418r';
      v240Script.async = false;
      v240Script.defer = false;
      document.body.appendChild(v240Script);
    }

    // v2.6.7 성능 오버레이 — 수동 "다시 생성" 버튼은 localStorage 캐시 우회
    // v2.6.6 까지는 manual 요청까지 캐시로 응답해 "다시 생성" 버튼이 깜빡만 하고
    // 실제 AI 재생성이 안 되던 버그. autoMode 없는 요청은 캐시 스킵 후 서버 호출.
    const existingV260Perf = document.getElementById('ws-ext-patch-v260-perf');
    if (!existingV260Perf) {
      const v260PerfScript = document.createElement('script');
      v260PerfScript.id = 'ws-ext-patch-v260-perf';
      v260PerfScript.src = '/search/content-v260-perf.js?v=20260418y';
      v260PerfScript.async = false;
      v260PerfScript.defer = false;
      document.body.appendChild(v260PerfScript);
    }

    // v2.7.0 050 안심번호 + 관계자 연락처 오버레이 (contacts JSONB 렌더)
    const existingV270Contacts = document.getElementById('ws-ext-patch-v270-contacts');
    if (!existingV270Contacts) {
      const v270ContactsScript = document.createElement('script');
      v270ContactsScript.id = 'ws-ext-patch-v270-contacts';
      v270ContactsScript.src = '/search/content-v270-contacts.js?v=20260418a1';
      v270ContactsScript.async = false;
      v270ContactsScript.defer = false;
      document.body.appendChild(v270ContactsScript);
    }
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
    <div id="ws-search-root" style={{ minHeight: '100vh' }} />
  );
}

// ── 스타일 ──
const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: '#f7faf7',
};

const cardStyle: React.CSSProperties = {
  maxWidth: 420,
  width: '100%',
  background: '#fff',
  border: '1px solid #e5eee5',
  borderRadius: 12,
  padding: '32px 28px',
  textAlign: 'center',
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#2D5A27',
  color: '#fff',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#f0f5f0',
  color: '#2D5A27',
  borderRadius: 8,
  border: '1px solid #d5e5d5',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
