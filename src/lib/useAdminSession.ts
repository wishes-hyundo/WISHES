'use client';

// ─────────────────────────────────────────────────────────────
// useAdminSession — 어드민 페이지 공용 세션 훅
//
// 2026-04-24 (L-session-unify): localStorage 우선 + refresh-session 폴백.
//   이전 구현은 supabase.auth.getSession() 만 의존했기 때문에
//   admin-auth.html 로 로그인한 사용자의 Supabase client 세션이
//   오래 만료되면 /admin/listings, /admin/dedup 등 이 훅을 쓰는
//   모든 React 페이지가 /login 으로 즉시 리다이렉트되는 문제 발생.
//
//   새 로직:
//   1) localStorage.ws_token (admin-auth.html 에서 저장) 이 있고
//      admin_bridge_ 위조 접두어가 아니면 그대로 사용.
//   2) 없으면 Supabase session 을 fallback 으로 확인 (legacy 경로).
//   3) 둘 다 없으면 ws_refresh_token 으로 /api/auth/refresh-session 호출
//      하여 재발급 시도. 성공하면 localStorage 업데이트 후 사용.
//   4) 모두 실패 시 /admin/admin-auth.html 로 리다이렉트 — 전체 admin
//      영역이 동일한 로그인 페이지를 공유하도록 통일 (layout.tsx 와 일치).
//
// 참고: 핸드오프 주의사항 #1 — Supabase client 의 autoRefreshToken 이
//   실환경에서 신뢰할 수 없음. /api/auth/refresh-session 을 단일 진실
//   공급원으로 사용.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from './supabase';

export interface UseAdminSessionReturn {
  /** 현재 유효한 access_token. 아직 로드 중이거나 세션이 없으면 null. */
  token: string | null;
  /** 세션 체크가 진행 중이면 true. */
  loading: boolean;
  /** fetch() 의 headers 에 펼쳐 쓰도록 준비된 Authorization 헤더. */
  authHeader: () => Record<string, string>;
}

const ADMIN_LOGIN_URL = '/admin/admin-auth.html';

/**
 * redirectPath 인자는 하위 호환성을 위해 남겨두지만, 실제로는 사용하지 않는다.
 *  어차피 /admin/admin-auth.html 로 돌아가면 원래 접근 경로는 히스토리로만 유지.
 *  (기존 구현은 /login?redirect=<path> 로 갔기 때문에 인자가 필요했음.)
 */
export function useAdminSession(_redirectPath: string = '/admin'): UseAdminSessionReturn {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const redirectToLogin = () => {
      if (cancelled) return;
      if (typeof window !== 'undefined') {
        window.location.href = ADMIN_LOGIN_URL;
      } else {
        router.replace(ADMIN_LOGIN_URL);
      }
    };

    (async () => {
      try {
        if (typeof window === 'undefined') {
          return;
        }

        // 1) localStorage.ws_token 우선
        const stored = window.localStorage.getItem('ws_token');
        if (stored && !stored.startsWith('admin_bridge_') && stored.length > 20) {
          if (!cancelled) setToken(stored);
          return;
        }

        // 2) Supabase session fallback (legacy 경로 호환)
        try {
          const sb = createAuthClient();
          const { data: { session } } = await sb.auth.getSession();
          if (cancelled) return;
          if (session?.access_token) {
            try { window.localStorage.setItem('ws_token', session.access_token); } catch {}
            if (session.refresh_token) {
              try { window.localStorage.setItem('ws_refresh_token', session.refresh_token); } catch {}
            }
            setToken(session.access_token);
            return;
          }
        } catch {
          /* Supabase client 에러는 refresh 단계로 폴백 */
        }

        // 3) refresh-session 시도
        const refreshToken = window.localStorage.getItem('ws_refresh_token');
        if (refreshToken) {
          try {
            const rr = await fetch('/api/auth/refresh-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (rr.ok) {
              const rd = await rr.json();
              if (rd?.access_token) {
                try {
                  window.localStorage.setItem('ws_token', rd.access_token);
                  if (rd.refresh_token) {
                    window.localStorage.setItem('ws_refresh_token', rd.refresh_token);
                  }
                  // ws_token_expires_at 은 Unix seconds 또는 ISO 둘 다 보존.
                  if (rd.expires_at) {
                    window.localStorage.setItem('ws_token_expires_at', String(rd.expires_at));
                  }
                } catch {}
                if (cancelled) return;
                setToken(rd.access_token);
                return;
              }
            }
          } catch {
            /* refresh 실패 — 아래에서 redirect */
          }
        }

        // 4) 모든 수단 실패 → admin-auth.html 로
        redirectToLogin();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  const authHeader = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  return { token, loading, authHeader };
}
