'use client';

// ─────────────────────────────────────────────────────────────
// useAdminSession — 어드민 페이지 공용 세션 훅 (L-sec5 2026-04-22)
//
// 레거시 패턴:
//   const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';
//   fetch('/api/admin/...', { headers: { Authorization: 'Bearer ' + AUTH_TOKEN } });
//
// 이 패턴은 1) 클라이언트 번들에 마스터 토큰을 노출, 2) env 미설정 시
// 'wishes2026' 를 그대로 쓰는 박제 fallback 이 남아있었다.
//
// 신규 패턴:
//   const { token, loading, authHeader } = useAdminSession('/admin/listings/new');
//   if (loading || !token) return <Loading />;
//   fetch('/api/admin/...', { headers: { ...authHeader(), 'Content-Type': 'application/json' } });
//
// 동작: Supabase 세션의 access_token 을 그대로 Bearer 헤더에 실어 보낸다.
// 서버 측 verifyAdminAuth 가 JWT 서명 + admin_users.role/status 까지 검증한다.
// 세션이 없으면 /login?redirect=... 로 리다이렉트.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from './supabase';

export interface UseAdminSessionReturn {
  /** Supabase access_token. 세션 없는 동안 null */
  token: string | null;
  /** 세션 체크가 진행 중이면 true */
  loading: boolean;
  /** fetch() 의 headers 에 펼쳐 쓰도록 준비된 Authorization 헤더 */
  authHeader: () => Record<string, string>;
}

export function useAdminSession(redirectPath: string = '/admin'): UseAdminSessionReturn {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createAuthClient();
        const { data: { session } } = await sb.auth.getSession();
        if (cancelled) return;
        if (!session) {
          router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
          return;
        }
        setToken(session.access_token);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router, redirectPath]);

  const authHeader = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  return { token, loading, authHeader };
}
