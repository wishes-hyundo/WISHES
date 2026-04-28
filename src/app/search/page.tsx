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
import { createAuthClient } from '@/lib/supabase';
// L-sec147 (2026-04-23, C-2 phase 3b): adminFetch wrapper for CSRF + cookie + Bearer.
import { adminFetch } from '@/lib/adminFetch';

type PageState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [state, setState] = useState<PageState>('loading');

  // ── 인증 확인 (Supabase 호출 없음, 즉시 판단) ──
  useEffect(() => {
    try {
      const token = (sessionStorage.getItem('ws_token')||(function(){try{var _lv=localStorage.getItem('ws_token');if(_lv){sessionStorage.setItem('ws_token',_lv);var u=localStorage.getItem('ws_user');if(u)sessionStorage.setItem('ws_user',u);var t=localStorage.getItem('ws_login_time');if(t)sessionStorage.setItem('ws_login_time',t);return _lv;}}catch(e){}return '';})());
      if (token) {
        setState('ok');
      } else {
        setState('nosession');
      }
    } catch {
      setState('nosession');
    }
  }, []);

  // ── Supabase 세션 자동 갱신 ──
  useEffect(() => {
    if (state !== 'ok') return;

    let cancelled = false;
    const refreshAndPersist = async () => {
      try {
        if (cancelled) return;
        let stored = '';
        try {
          stored = sessionStorage.getItem('ws_refresh_token')
            || localStorage.getItem('ws_refresh_token') || '';
        } catch {}
        if (!stored) return;

        const r = await fetch('/api/auth/refresh-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: stored }),
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (cancelled || !r.ok) return;
        const j = await r.json() as { access_token?: string; refresh_token?: string };
        if (!j?.access_token) return;

        const tok = j.access_token;
        const now = Date.now().toString();
        try {
          sessionStorage.setItem('ws_token', tok);
          sessionStorage.setItem('ws_login_time', now);
          localStorage.setItem('ws_token', tok);
          localStorage.setItem('ws_login_time', now);
          if (j.refresh_token) {
            sessionStorage.setItem('ws_refresh_token', j.refresh_token);
            localStorage.setItem('ws_refresh_token', j.refresh_token);
          }
        } catch {}
      } catch {}
    };

    const initialTimer = setTimeout(refreshAndPersist, 100);
    const interval = setInterval(refreshAndPersist, 15 * 60 * 1000);

    const onActivate = () => {
      if (document.visibilityState === 'visible') refreshAndPersist();
    };
    const onFocus = () => refreshAndPersist();
    const onOnline = () => refreshAndPersist();
    document.addEventListener('visibilitychange', onActivate);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onActivate);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [state]);

  // ── 인증 통과 시: 카카오맵 사전 초기화 + 확장프로그램 CSS/JS 주입 ──
  useEffect(() => {
    if (state !== 'ok') return;

    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        const wsToken = (() => {
          try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
          catch { return ''; }
        })();
        if (wsToken) {
          w.__WS_PREFETCH__ = adminFetch('/api/admin/listings?fields=minimal', {
            headers: { Authorization: 'Bearer ' + wsToken },
            cache: 'no-cache',
          })
            .then((r) => r.json())
            .then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null))
            .catch(() => null);
        }
      }
    } catch {}

    try {
      interface KakaoMaps { load: (cb: () => void) => void; Map?: unknown }
      interface KakaoGlobal { maps: KakaoMaps }
      const kk = (window as unknown as { kakao?: KakaoGlobal }).kakao;
      if (kk && kk.maps && typeof kk.maps.load === 'function' && !kk.maps.Map) {
        kk.maps.load(() => {});
      }
    } catch {}

    let link = document.getElementById('ws-ext-styles') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'ws-ext-styles';
      link.rel = 'stylesheet';
      link.href = '/search/styles.css?v=20260420a';
      document.head.appendChild(link);
    }

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
    script.src = '/search/content.js?v=20260420h-scrub';
    script.async = false;
    document.body.appendChild(script);

    const existingPatch = document.getElementById('ws-ext-patch');
    if (!existingPatch) {
      const patchScript = document.createElement('script');
      patchScript.id = 'ws-ext-patch';
      patchScript.src = '/search/content-v230-patch.js?v=20260502';
      patchScript.async = false;
      patchScript.defer = false;
      document.body.appendChild(patchScript);
    }

    const existingV240 = document.getElementById('ws-ext-patch-v240');
    if (!existingV240) {
      const v240Script = document.createElement('script');
      v240Script.id = 'ws-ext-patch-v240';
      v240Script.src = '/search/content-v240-detail.js?v=20260420g';
      v240Script.async = false;
      v240Script.defer = false;
      document.body.appendChild(v240Script);
    }

    const existingV260Perf = document.getElementById('ws-ext-patch-v260-perf');
    if (!existingV260Perf) {
      const v260PerfScript = document.createElement('script');
      v260PerfScript.id = 'ws-ext-patch-v260-perf';
      v260PerfScript.src = '/search/content-v260-perf.js?v=20260428real';
      v260PerfScript.async = false;
      v260PerfScript.defer = false;
      document.body.appendChild(v260PerfScript);
    }

    const existingV270Contacts = document.getElementById('ws-ext-patch-v270-contacts');
    if (!existingV270Contacts) {
      const v270ContactsScript = document.createElement('script');
      v270ContactsScript.id = 'ws-ext-patch-v270-contacts';
      v270ContactsScript.src = '/search/content-v270-contacts.js?v=20260418a1';
      v270ContactsScript.async = false;
      v270ContactsScript.defer = false;
      document.body.appendChild(v270ContactsScript);
    }
    try {
      const prev = document.getElementById('ws-ext-patch-v270-freshness');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      const api = (window as unknown as { __WS_PATCH_V270__?: { rollback?: () => void } }).__WS_PATCH_V270__;
      if (api && typeof api.rollback === 'function') { try { api.rollback(); } catch {} }
      document.querySelectorAll('.v270-sort, #v270-sort-floating, #v270-summary-line, .v270-badge-wrap').forEach((n) => n.remove());
      document.querySelectorAll('[data-v270-badge]').forEach((n) => {
        n.removeAttribute('data-v270-badge');
        n.removeAttribute('data-v270-badge-key');
        n.classList.remove('v270-card-anchor');
      });
      const styleEl = document.getElementById('v270-fresh-styles');
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch {}

    const existingV280Mobile = document.getElementById('ws-ext-patch-v280-mobile');
    if (!existingV280Mobile) {
      const v280MobileScript = document.createElement('script');
      v280MobileScript.id = 'ws-ext-patch-v280-mobile';
      v280MobileScript.src = '/search/content-v280-mobile.js?v=20260420b';
      v280MobileScript.async = false;
      v280MobileScript.defer = false;
      document.body.appendChild(v280MobileScript);
    }

    const existingV290 = document.getElementById('ws-ext-patch-v290-polish');
    if (!existingV290) {
      const v290Script = document.createElement('script');
      v290Script.id = 'ws-ext-patch-v290-polish';
      v290Script.src = '/search/content-v290-polish.js?v=20260420b';
      v290Script.async = false;
      v290Script.defer = false;
      document.body.appendChild(v290Script);
    }

    const existingV291 = document.getElementById('ws-ext-patch-v291-stability');
    if (!existingV291) {
      const v291Script = document.createElement('script');
      v291Script.id = 'ws-ext-patch-v291-stability';
      v291Script.src = '/search/content-v291-stability.js?v=20260420a';
      v291Script.async = false;
      v291Script.defer = false;
      document.body.appendChild(v291Script);
    }

    const existingV292 = document.getElementById('ws-ext-patch-v292-global-search');
    if (!existingV292) {
      const v292Script = document.createElement('script');
      v292Script.id = 'ws-ext-patch-v292-global-search';
      v292Script.src = '/search/content-v292-global-search.js?v=20260420a';
      v292Script.async = false;
      v292Script.defer = false;
      document.body.appendChild(v292Script);
    }

    const existingV293 = document.getElementById('ws-ext-patch-v293-alert-log');
    if (!existingV293) {
      const v293Script = document.createElement('script');
      v293Script.id = 'ws-ext-patch-v293-alert-log';
      v293Script.src = '/search/content-v293-alert-log.js?v=20260420c';
      v293Script.async = false;
      v293Script.defer = false;
      document.body.appendChild(v293Script);
    }

    const existingV294 = document.getElementById('ws-ext-patch-v294-scope');
    if (!existingV294) {
      const v294Script = document.createElement('script');
      v294Script.id = 'ws-ext-patch-v294-scope';
      v294Script.src = '/search/content-v294-scope.js?v=20260428legacy2';
      v294Script.async = false;
      v294Script.defer = false;
      document.body.appendChild(v294Script);
    }

    const existingV295 = document.getElementById('ws-ext-patch-v295-detail-hydrate');
    if (!existingV295) {
      const v295Script = document.createElement('script');
      v295Script.id = 'ws-ext-patch-v295-detail-hydrate';
      v295Script.src = '/search/content-v295-detail-hydrate.js?v=20260424d';
      v295Script.async = false;
      v295Script.defer = false;
      document.body.appendChild(v295Script);
    }

    const existingV297 = document.getElementById('ws-ext-patch-v297-edit');
    if (!existingV297) {
      const v297Script = document.createElement('script');
      v297Script.id = 'ws-ext-patch-v297-edit';
      v297Script.src = '/search/content-v297-edit.js?v=20260423a';
      v297Script.async = false;
      v297Script.defer = false;
      document.body.appendChild(v297Script);
    }

    const existingV300 = document.getElementById('ws-ext-patch-v300-aidesc-v2');
    if (!existingV300) {
      const v300Script = document.createElement('script');
      v300Script.id = 'ws-ext-patch-v300-aidesc-v2';
      v300Script.src = '/search/content-v300-aidesc-v2.js?v=20260427a';
      v300Script.async = false;
      v300Script.defer = false;
      document.body.appendChild(v300Script);
    }

    const existingV306 = document.getElementById('ws-ext-patch-v306-bldg-unit');
    if (!existingV306) {
      const v306Script = document.createElement('script');
      v306Script.id = 'ws-ext-patch-v306-bldg-unit';
      v306Script.src = '/search/content-v306-bldg-unit.js?v=20260429-rag';
      v306Script.async = false;
      v306Script.defer = false;
      document.body.appendChild(v306Script);
    }

    const existingV307 = document.getElementById('ws-ext-patch-v307-listing-form');
    if (!existingV307) {
      const v307Script = document.createElement('script');
      v307Script.id = 'ws-ext-patch-v307-listing-form';
      v307Script.src = '/search/content-v307-listing-form.js?v=20260428redirect';
      v307Script.async = false;
      v307Script.defer = false;
      document.body.appendChild(v307Script);
    }

    const existingV308 = document.getElementById('ws-ext-patch-v308-roadview');
    if (!existingV308) {
      const v308Script = document.createElement('script');
      v308Script.id = 'ws-ext-patch-v308-roadview';
      v308Script.src = '/search/content-v308-roadview.js?v=20260429e';
      v308Script.async = false;
      v308Script.defer = false;
      document.body.appendChild(v308Script);
    }

    // P0 (2026-04-29): v309 — 사장님 발견 4가지 (옵션·관리비·룸·UI 밸런스)
    const existingV309 = document.getElementById('ws-ext-patch-v309-modal-completeness');
    if (!existingV309) {
      const v309Script = document.createElement('script');
      v309Script.id = 'ws-ext-patch-v309-modal-completeness';
      v309Script.src = '/search/content-v309-modal-completeness.js?v=20260429b';
      v309Script.async = false;
      v309Script.defer = false;
      document.body.appendChild(v309Script);
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
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>로그인이 필요합니다</h1>
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
