'use client';

/**
 * /search — 중개사 포털
 *
 * wishes-search-extension (v2.2.1) 확장프로그램을 웹 페이지에 그대로 임베드합니다.
 * 기능/디자인이 확장프로그램과 100% 동일합니다.
 *
 * 구조:
 *  1) Supabase 세션 확인 → /api/auth/me 로 승인 상태 검증
 *  2) 승인된 계정이면 /search/styles.css + /search/content.js 를 동적 로드
 *  3) content.js 는 _WS_EMBEDDED_MODE 로 동작하여 자체 인증 게이트를 스킵하고
 *     boot 직후 window.WS.showSearchUI() 를 자동 호출
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';

type AuthState = 'loading' | 'nosession' | 'pending' | 'denied' | 'error' | 'ok';

export default function SearchPortalPage() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    // ⚡ 매물 프리페치 — 인증 검증과 병렬로 즉시 시작 (체감 로딩 시간 대폭 단축)
    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        w.__WS_PREFETCH__ = fetch('/api/admin/listings?fields=minimal', {
          headers: { Authorization: 'Bearer wishes2026' },
          cache: 'force-cache',
        })
          .then((r) => r.json())
          .then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null))
          .catch(() => null);
      }
    } catch {}

    // ⚡ 카카오맵 SDK 즉시 로드 — preload 가 아닌 실제 script 태그로 백그라운드 실행
    //    사용자가 지도보기 탭을 열 시점에는 이미 SDK 파싱 완료 → 지도 즉시 렌더
    try {
      const head = document.head;
      // DNS preconnect
      ['https://dapi.kakao.com', 'https://t1.daumcdn.net'].forEach((h) => {
        if (document.querySelector(`link[rel="preconnect"][href="${h}"]`)) return;
        const l = document.createElement('link');
        l.rel = 'preconnect';
        l.href = h;
        l.crossOrigin = '';
        head.appendChild(l);
      });
      // 실제 SDK 로드 — 한 번만
      if (!document.getElementById('ws-kakao-sdk')) {
        const sc = document.createElement('script');
        sc.id = 'ws-kakao-sdk';
        sc.async = true;
        sc.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=a1c65d0ec2ecc8d2d231f8558f896e38&autoload=false&libraries=services,clusterer,drawing';
        sc.onload = () => {
          try {
            interface KakaoMaps { load: (cb: () => void) => void }
            interface KakaoGlobal { maps: KakaoMaps }
            const kk = (window as unknown as { kakao?: KakaoGlobal }).kakao;
            if (kk && kk.maps && typeof kk.maps.load === 'function') {
              kk.maps.load(() => { /* 사전 초기화 완료 */ });
            }
          } catch {}
        };
        head.appendChild(sc);
      }
    } catch {}

    (async () => {
      try {
        const sb = createAuthClient();
        const { data: { session }, error: sessErr } = await sb.auth.getSession();
        if (sessErr) {
          if (!cancelled) { setErrMsg(sessErr.message); setState('error'); }
          return;
        }
        if (!session) {
          if (!cancelled) setState('nosession');
          return;
        }

        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!data.success) {
          if (!cancelled) { setErrMsg(data.message || '인증 실패'); setState('error'); }
          return;
        }
        if (data.user.status === 'pending') {
          if (!cancelled) setState('pending');
          return;
        }
        if (!data.user.canAccessBroker) {
          if (!cancelled) setState('denied');
          return;
        }

        // ✅ 인증 통과 — sessionStorage 에 브릿지 토큰 세팅 (확장 코드 호환용)
        try {
          sessionStorage.setItem('ws_token', 'admin_bridge_' + session.access_token);
          sessionStorage.setItem('ws_user', JSON.stringify({
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            status: data.user.status,
          }));
          sessionStorage.setItem('ws_login_time', Date.now().toString());
        } catch {}

        if (!cancelled) setState('ok');
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          setState('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // 인증 통과 시 확장프로그램 CSS + JS 를 주입
  useEffect(() => {
    if (state !== 'ok') return;

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
      // 이미 로드된 경우 (HMR/재마운트): 오버레이만 다시 표시
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
        <div style={{ color: '#666' }}>인증 확인 중...</div>
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
            <button onClick={() => router.push('/login?redirect=/search')} style={btnPrimary}>로그인</button>
            <button onClick={() => router.push('/signup')} style={btnSecondary}>회원가입</button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#d97706' }}>승인 대기 중</h2>
          <p style={{ color: '#666', lineHeight: 1.6, fontSize: 14 }}>
            가입 신청이 접수되었습니다.<br />사장님의 승인 후 이용하실 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>접근 권한이 없습니다</h2>
          <p style={{ color: '#666', lineHeight: 1.6, fontSize: 14 }}>
            이 계정에는 중개사 포털 접근 권한이 부여되지 않았습니다.<br />관리자에게 문의해주세요.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>오류</h2>
          <p style={{ color: '#666', fontSize: 13, wordBreak: 'break-all', marginBottom: 20 }}>{errMsg}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => router.push('/login?redirect=/search')} style={btnPrimary}>로그인 페이지</button>
            <button onClick={() => window.location.reload()} style={btnSecondary}>새로고침</button>
          </div>
        </div>
      </div>
    );
  }

  // state === 'ok' — content.js 가 #ws-search-overlay 를 document.body 에 직접 삽입합니다.
  // 이 React 페이지는 투명 배경만 제공합니다.
  return (
    <div id="ws-search-root" style={{ minHeight: '100vh', background: '#f0f7ed' }}>
      {/* content.js 가 document.body 에 ws-search-overlay 를 주입 */}
    </div>
  );
}

// ---------- styles ----------

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f5f5',
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 40,
  maxWidth: 440,
  textAlign: 'center',
  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
};

const btnPrimary: React.CSSProperties = {
  padding: '11px 24px',
  background: '#2D5A27',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  padding: '11px 24px',
  background: '#fff',
  color: '#2D5A27',
  border: '1px solid #2D5A27',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};
