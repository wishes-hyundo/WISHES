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

  // ── Supabase 세션 자동 갱신 (세션 유지) ──
  // Supabase access_token TTL = 1시간. 45분마다 refreshSession() 호출하여
  // ws_token 을 갱신된 access_token 으로 재기록 → 탭이 오래 열려 있어도 끊기지 않음.
  useEffect(() => {
    if (state !== 'ok') return;

    let cancelled = false;
    const refreshAndPersist = async () => {
      try {
        const sb = createAuthClient();
        const { data, error } = await sb.auth.refreshSession();
        if (cancelled) return;
        if (error || !data.session) return;
        const tok = 'admin_bridge_' + data.session.access_token;
        const now = Date.now().toString();
        try {
          sessionStorage.setItem('ws_token', tok);
          sessionStorage.setItem('ws_login_time', now);
          localStorage.setItem('ws_token', tok);
          localStorage.setItem('ws_login_time', now);
        } catch {}
      } catch {}
    };

    // 첫 실행: 페이지 마운트 후 10초 뒤 (초기 로딩 방해 X)
    const initialTimer = setTimeout(refreshAndPersist, 10000);
    // 주기 실행: 45분마다
    const interval = setInterval(refreshAndPersist, 45 * 60 * 1000);
    // 탭 포커스 복귀 시도 1회 갱신 (탭 비활성 중 setInterval 일시정지 대응)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshAndPersist();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state]);

  // ── 인증 통과 시: 카카오맵 사전 초기화 + 확장프로그램 CSS/JS 주입 ──
  useEffect(() => {
    if (state !== 'ok') return;

    // 매물 프리페치
    //   L-sec5 (2026-04-22): 하드코드 'Bearer wishes2026' 제거.
    //   ws_token 은 /login 에서 'admin_bridge_<Supabase access_token>' 형식으로 저장되고
    //   verifyAdminAuth 가 해당 프리픽스를 JWT 로 풀어 admin_users.role/status 까지 검증한다.
    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        const wsToken = (() => {
          try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
          catch { return ''; }
        })();
        if (wsToken) {
          w.__WS_PREFETCH__ = fetch('/api/admin/listings?fields=minimal', {
            headers: { Authorization: 'Bearer ' + wsToken },
            cache: 'no-cache',
          })
            .then((r) => r.json())
            .then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null))
            .catch(() => null);
        }
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
      link.href = '/search/styles.css?v=20260420a';
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
    // 세션 지속성 핫픽스(redirect 재검증) 강제 반영용 cache-buster
    script.src = '/search/content.js?v=20260420h-scrub';
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
      v240Script.src = '/search/content-v240-detail.js?v=20260420g';
      v240Script.async = false;
      v240Script.defer = false;
      document.body.appendChild(v240Script);
    }

    // v2.6.8 성능 오버레이 — seo_tags → ai_tags DB 필드 미러링 + allListings 동기화
    // 이전 버전들은 content-v240-detail.js 의 v248Saved 판정(L.ai_tags 체크)이
    // Supabase 초기 로드(seo_tags 컬럼) 와 필드 이름 미스매치로 무조건 false →
    // 매 상세보기마다 자동 재생성 트리거. v2.6.8 부터 showDetail 훅에서 미러링.
    const existingV260Perf = document.getElementById('ws-ext-patch-v260-perf');
    if (!existingV260Perf) {
      const v260PerfScript = document.createElement('script');
      v260PerfScript.id = 'ws-ext-patch-v260-perf';
      v260PerfScript.src = '/search/content-v260-perf.js?v=20260420a';
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
    // ⚠️ content-v270-freshness.js 는 "공실클럽 기준" 문구를 UI에 노출시켰고,
    //    카드 위에 배지 오버레이를 덮어 주소를 가리는 이슈가 있어 전면 제거.
    //    (파일은 폴더에 남기되 스크립트 로드는 영구 차단)
    // 이전에 설치된 흔적이 있으면 정리
    try {
      const prev = document.getElementById('ws-ext-patch-v270-freshness');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      const api = (window as unknown as { __WS_PATCH_V270__?: { rollback?: () => void } }).__WS_PATCH_V270__;
      if (api && typeof api.rollback === 'function') { try { api.rollback(); } catch {} }
      // 잔여 DOM 제거 (정렬 셀렉터/요약/배지 래퍼/스타일)
      document.querySelectorAll('.v270-sort, #v270-sort-floating, #v270-summary-line, .v270-badge-wrap').forEach((n) => n.remove());
      document.querySelectorAll('[data-v270-badge]').forEach((n) => {
        n.removeAttribute('data-v270-badge');
        n.removeAttribute('data-v270-badge-key');
        n.classList.remove('v270-card-anchor');
      });
      const styleEl = document.getElementById('v270-fresh-styles');
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch {}

    // v2.8.0 모바일 최적화 패치 로드 (최후순)
    //   - IntersectionObserver 실패 회피: 이미지 즉시 hydrate
    //   - 크롤링 출처 G/O 배지 DOM 제거
    //   - 모바일 필터 초기 접힘 + 접근성 라벨 보강
    const existingV280Mobile = document.getElementById('ws-ext-patch-v280-mobile');
    if (!existingV280Mobile) {
      const v280MobileScript = document.createElement('script');
      v280MobileScript.id = 'ws-ext-patch-v280-mobile';
      v280MobileScript.src = '/search/content-v280-mobile.js?v=20260420b';
      v280MobileScript.async = false;
      v280MobileScript.defer = false;
      document.body.appendChild(v280MobileScript);
    }

    // v2.9.0 2차 모바일 폴리싱 (22건 — 터치타겟·CLS·피드백·스켈레톤·오프라인 등)
    const existingV290 = document.getElementById('ws-ext-patch-v290-polish');
    if (!existingV290) {
      const v290Script = document.createElement('script');
      v290Script.id = 'ws-ext-patch-v290-polish';
      v290Script.src = '/search/content-v290-polish.js?v=20260420b';
      v290Script.async = false;
      v290Script.defer = false;
      document.body.appendChild(v290Script);
    }

    // v2.9.1 안정성 핫픽스 — v290 이미지 페이드 회귀 제거 + 안정화 (반드시 v290 다음에 로드)
    const existingV291 = document.getElementById('ws-ext-patch-v291-stability');
    if (!existingV291) {
      const v291Script = document.createElement('script');
      v291Script.id = 'ws-ext-patch-v291-stability';
      v291Script.src = '/search/content-v291-stability.js?v=20260420a';
      v291Script.async = false;
      v291Script.defer = false;
      document.body.appendChild(v291Script);
    }

    // v2.9.2 상단 통합검색(ws-global-search) 복원 — #ws-btn-search 클릭/엔터가
    // WS.allListings 에 대해 광역 substring 필터를 수행하도록 연결.
    // (기존 ws-keyword 및 지역/유형 필터와 직교)
    const existingV292 = document.getElementById('ws-ext-patch-v292-global-search');
    if (!existingV292) {
      const v292Script = document.createElement('script');
      v292Script.id = 'ws-ext-patch-v292-global-search';
      v292Script.src = '/search/content-v292-global-search.js?v=20260420a';
      v292Script.async = false;
      v292Script.defer = false;
      document.body.appendChild(v292Script);
    }

    // v2.9.3 알림 로그 시스템 (Phase 1+2) — 🔔 벨 버튼 + 드로어 + localStorage 히스토리
    // 기존 showToast / _autoDedup / _showDupSuspectAlert 를 래핑하여
    // 모든 알림을 최근 200건 타임라인으로 수집한다.
    const existingV293 = document.getElementById('ws-ext-patch-v293-alert-log');
    if (!existingV293) {
      const v293Script = document.createElement('script');
      v293Script.id = 'ws-ext-patch-v293-alert-log';
      v293Script.src = '/search/content-v293-alert-log.js?v=20260420c';
      v293Script.async = false;
      v293Script.defer = false;
      document.body.appendChild(v293Script);
    }

    // v2.9.4 (v7 §4) — 내 매물/전체 scope 토글
    //   /admin/search 에 얹었던 ScopeToggle 을 중개사 포털 단일 진입점인 /search 로
    //   재배치. fetch 래핑 + 토글 UI 주입 + WS.loadData 재호출로 기능 구현.
    const existingV294 = document.getElementById('ws-ext-patch-v294-scope');
    if (!existingV294) {
      const v294Script = document.createElement('script');
      v294Script.id = 'ws-ext-patch-v294-scope';
      v294Script.src = '/search/content-v294-scope.js?v=20260422e';
      v294Script.async = false;
      v294Script.defer = false;
      document.body.appendChild(v294Script);
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
