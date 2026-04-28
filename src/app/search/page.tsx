'use client';

/**
 * /search — 중개사 포털
 */

import React, { useEffect, useState } from 'react';
import { createAuthClient } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminFetch';

type PageState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [state, setState] = useState<PageState>('loading');

  // L-cache-nuke (2026-04-29): 사장님 cache 영구 stale 호소. /search 진입 시 자동
  //   Service Worker unregister + Cache API 모두 삭제. 매번 fresh 보장.
  useEffect(() => {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister().catch(function(){}); });
        }).catch(function(){});
      }
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k).catch(function(){}); });
        }).catch(function(){});
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      const token = (sessionStorage.getItem('ws_token')||(function(){try{var _lv=localStorage.getItem('ws_token');if(_lv){sessionStorage.setItem('ws_token',_lv);var u=localStorage.getItem('ws_user');if(u)sessionStorage.setItem('ws_user',u);var t=localStorage.getItem('ws_login_time');if(t)sessionStorage.setItem('ws_login_time',t);return _lv;}}catch(e){}return '';})());
      if (token) setState('ok'); else setState('nosession');
    } catch { setState('nosession'); }
  }, []);

  useEffect(() => {
    if (state !== 'ok') return;
    let cancelled = false;
    const refreshAndPersist = async () => {
      try {
        if (cancelled) return;
        let stored = '';
        try { stored = sessionStorage.getItem('ws_refresh_token') || localStorage.getItem('ws_refresh_token') || ''; } catch {}
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
    const onActivate = () => { if (document.visibilityState === 'visible') refreshAndPersist(); };
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

  useEffect(() => {
    if (state !== 'ok') return;

    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        const wsToken = (() => { try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; } catch { return ''; } })();
        if (wsToken) {
          w.__WS_PREFETCH__ = adminFetch('/api/admin/listings?fields=minimal', {
            headers: { Authorization: 'Bearer ' + wsToken },
            cache: 'no-cache',
          }).then((r) => r.json()).then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null)).catch(() => null);
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
        if (w.WS?.loadData && !w.WS._loadingData && (!w.WS.allListings || w.WS.allListings.length === 0)) w.WS.loadData();
      } catch {}
      return;
    }
    const script = document.createElement('script');
    script.id = 'ws-ext-content';
    script.src = '/search/content.js?v=20260420h-scrub';
    script.async = false;
    document.body.appendChild(script);

    const patches: Array<[string, string]> = [
      ['ws-ext-patch', '/search/content-v230-patch.js?v=20260502'],
      ['ws-ext-patch-v240', '/search/content-v240-detail.js?v=20260420g'],
      ['ws-ext-patch-v260-perf', '/search/content-v260-perf.js?v=20260428real'],
      ['ws-ext-patch-v270-contacts', '/search/content-v270-contacts.js?v=20260418a1'],
      ['ws-ext-patch-v280-mobile', '/search/content-v280-mobile.js?v=20260420b'],
      ['ws-ext-patch-v290-polish', '/search/content-v290-polish.js?v=20260420b'],
      ['ws-ext-patch-v291-stability', '/search/content-v291-stability.js?v=20260420a'],
      ['ws-ext-patch-v292-global-search', '/search/content-v292-global-search.js?v=20260420a'],
      ['ws-ext-patch-v293-alert-log', '/search/content-v293-alert-log.js?v=20260420c'],
      ['ws-ext-patch-v294-scope', '/search/content-v294-scope.js?v=20260428legacy2'],
      ['ws-ext-patch-v295-detail-hydrate', '/search/content-v295-detail-hydrate.js?v=20260424d'],
      ['ws-ext-patch-v297-edit', '/search/content-v297-edit.js?v=20260423a'],
      ['ws-ext-patch-v300-aidesc-v2', '/search/content-v300-aidesc-v2.js?v=20260427a'],
      ['ws-ext-patch-v306-bldg-unit', '/search/content-v306-bldg-unit.js?v=20260429rev4'],
      ['ws-ext-patch-v307-listing-form', '/search/content-v307-listing-form.js?v=20260428redirect'],
      ['ws-ext-patch-v308-roadview', '/search/content-v308-roadview.js?v=20260429e'],
      ['ws-ext-patch-v310-modal-completeness', '/search/content-v310-modal-completeness.js?v=20260429a'],
      ['ws-ext-patch-v311-nearest-stations', '/search/content-v311-nearest-stations.js?v=20260429a'],
      // v312 (2026-04-29): 메인 모달 전유부 (.v240-info2 에 전용/공용/총면적 row) +
      //   Hero 영역 매물수정 버튼 + priceBox 밸런스 fix.
      ['ws-ext-patch-v312-main-modal-unit', '/search/content-v312-main-modal-unit.js?v=20260429bob'],
      // v313 (2026-04-29): 매물수정 패널 inline 사진 매니저 — drag-drop 업로드,
      //   서버측 Classic Negative + 워터마크 자동, '고급 보정' → /admin/photo-enhancer.
      //   View Transitions / Container Queries / Popover / WCAG 2.2 AAA / oklch.
      // v313 entry 제거 (CDN stale cache + v315 와 중복 mount 문제). v315 만 사용.
      // v315 (2026-04-29): 매물수정 패널 inline 사진/동영상 매니저 BoB.
      ['ws-ext-patch-v315-edit-photos', '/search/content-v315-edit-photos.js?v=20260429-toast'],
      // v314 (2026-04-29): 매물수정 버튼 위치 이동 — hero 에서 '기본 정보·옵션'
      //   섹션 헤더 우측 끝으로 (사장님 제안). View Transitions 60fps + oklch.
      ['ws-ext-patch-v314-edit-btn-pos', '/search/content-v314-edit-btn-pos.js?v=20260429a'],
    ];
    for (const [id, src] of patches) {
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = src;
        s.async = false;
        s.defer = false;
        document.body.appendChild(s);
      }
    }

    // v270 freshness 잔여 정리 (영구 차단)
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

  }, [state]);

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
