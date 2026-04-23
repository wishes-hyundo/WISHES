'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createAuthClient } from '@/lib/supabase';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [codeProcessed, setCodeProcessed] = useState(false);

  // 저장된 리다이렉트 경로 가져오기
  // L-sec51 (2026-04-22): sessionStorage 값이 XSS/확장프로그램에 의해
  //   //evil.com 등으로 오염될 경우 router.replace() 가 크로스오리진 네비게이션을
  //   따라갈 여지. same-origin path 화이트리스트로 방어.
  //
  // 2026-04-23: admin-auth.html 소셜 로그인 흐름에서 sessionStorage 유실 시
  // /api/auth/oauth-start 가 세팅한 ws_oauth_target 쿠키로 fallback.
  const _isSafePath = (raw: string): string | null => {
    const v = String(raw || '').trim();
    if (v.length === 0 || v.length > 512) return null;
    if (!v.startsWith('/')) return null;
    if (v.startsWith('//')) return null;
    if (v.includes('\\')) return null;
    return v;
  };
  const _readTargetCookie = (): string | null => {
    if (typeof document === 'undefined') return null;
    const parts = (document.cookie || '').split(';');
    for (const p of parts) {
      const [rawK, ...rest] = p.trim().split('=');
      if (rawK === 'ws_oauth_target') {
        try { return decodeURIComponent(rest.join('=')); } catch { return null; }
      }
    }
    return null;
  };
  const getRedirectPath = () => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('wishes-auth-redirect');
      if (saved) {
        sessionStorage.removeItem('wishes-auth-redirect');
        const v = _isSafePath(saved);
        if (v) return v;
      }
      const cookieVal = _readTargetCookie();
      if (cookieVal) {
        try { document.cookie = 'ws_oauth_target=; Max-Age=0; Path=/; SameSite=Lax'; } catch {}
        const v = _isSafePath(cookieVal);
        if (v) return v;
      }
    }
    return '/';
  };

  // 2026-04-23: admin 경로로 돌아가는 OAuth 콜백이라면, Supabase 세션만으로는
  // 기존 admin 레이아웃의 인증 게이트(ws_token/ws_user/ws_login_time) 를 통과하지
  // 못한다. 세션의 access_token 을 ws_token 으로 바꿔 심고 /api/auth/me 로
  // role/status 를 확인해 localStorage + sessionStorage 양쪽에 저장한다.
  const prepareAdminSession = async (path: string): Promise<'ok' | 'pending' | 'rejected' | 'error' | 'skip'> => {
    if (!path.startsWith('/admin')) return 'skip';
    try {
      const supabase = createAuthClient();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return 'error';

      const meRes = await Promise.race([
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((r) => r.json()),
        new Promise<{ success: boolean }>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]) as { success?: boolean; user?: { email?: string; name?: string; role?: string; status?: string } };

      if (!meRes?.success || !meRes?.user) return 'error';
      const me = meRes.user;
      if (me.status === 'pending') return 'pending';
      if (me.status === 'rejected') return 'rejected';
      if (me.status !== 'approved') return 'error';

      try {
        const tok = 'admin_bridge_' + accessToken;
        const userStr = JSON.stringify({
          email: me.email,
          name: me.name,
          role: me.role,
          status: me.status,
        });
        const now = Date.now().toString();
        sessionStorage.setItem('ws_token', tok);
        sessionStorage.setItem('ws_user', userStr);
        sessionStorage.setItem('ws_login_time', now);
        localStorage.setItem('ws_token', tok);
        localStorage.setItem('ws_user', userStr);
        localStorage.setItem('ws_login_time', now);
        localStorage.setItem('ws_keep_login', 'true');
      } catch {
        /* private mode — admin 레이아웃이 재인증 요구 */
      }

      return 'ok';
    } catch {
      return 'error';
    }
  };

  useEffect(() => {
    if (codeProcessed) return;

    const provider = searchParams.get('provider');

    // 네이버 OAuth 콜백 처리
    if (provider === 'naver') {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage('네이버 로그인이 취소되었습니다.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
        return;
      }

      // L-sec107 (2026-04-22): OAuth CSRF state 검증.
      //   signInWithNaver() 가 sessionStorage 에 stash 한 state 와 Naver 가
      //   redirect 로 돌려보낸 state 가 같아야 한다. 불일치 = 공격자 유도 callback.
      //
      // 2026-04-23: 정적 HTML admin-auth.html 에서 오는 경로는 sessionStorage 를
      // 직접 세팅할 수 없으므로 ws_naver_state HttpOnly 쿠키를 서버가 검증하도록
      // 클라이언트 검증은 sessionStorage 가 있을 때만 수행한다.
      let expectedState: string | null = null;
      try {
        expectedState = sessionStorage.getItem('wishes-naver-oauth-state');
      } catch {
        expectedState = null;
      }
      const stateValid =
        expectedState === null ||
        (Boolean(expectedState) && Boolean(state) && expectedState.length === (state as string).length && expectedState === state);
      // 일회성: 결과와 무관하게 저장값 제거
      try {
        sessionStorage.removeItem('wishes-naver-oauth-state');
      } catch {
        /* ignore */
      }
      if (!stateValid) {
        setCodeProcessed(true);
        setStatus('error');
        setErrorMessage('보안 검증에 실패했습니다. 네이버 로그인을 다시 시도해주세요.');
        setTimeout(() => router.replace(getRedirectPath()), 3000);
        return;
      }

      if (code) {
        setCodeProcessed(true);

        fetch('/api/auth/naver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        })
          .then((res) => res.json())
          .then(async (data) => {
            if (data.token_hash) {
              const supabase = createAuthClient();
              const { error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: data.token_hash,
                type: 'magiclink',
              });

              if (verifyError) {
                console.error('Naver verifyOtp error:', verifyError.message);
                setStatus('error');
                setErrorMessage('세션 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
                setTimeout(() => router.replace(getRedirectPath()), 3000);
              } else {
                const redirectPath = getRedirectPath();
                const adminResult = await prepareAdminSession(redirectPath);
                if (adminResult === 'pending') {
                  setStatus('error');
                  setErrorMessage('관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.');
                  setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 2500);
                  return;
                }
                if (adminResult === 'rejected') {
                  setStatus('error');
                  setErrorMessage('가입이 거절되었습니다. 관리자에게 문의하세요.');
                  setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 2500);
                  return;
                }
                setStatus('success');
                setTimeout(() => router.replace(redirectPath), 800);
              }
            } else {
              setStatus('error');
              setErrorMessage(data.error || '네이버 로그인 처리 중 오류가 발생했습니다.');
              setTimeout(() => router.replace(getRedirectPath()), 3000);
            }
          })
          .catch(() => {
            setStatus('error');
            setErrorMessage('네이버 로그인 처리 중 오류가 발생했습니다.');
            setTimeout(() => router.replace(getRedirectPath()), 3000);
          });
        return;
      }

      setStatus('error');
      setErrorMessage('네이버 인증 정보가 없습니다.');
      setTimeout(() => router.replace(getRedirectPath()), 2000);
      return;
    }

    // 에러 파라미터 확인
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || '로그인 중 오류가 발생했습니다.');
      setTimeout(() => router.replace(getRedirectPath()), 3000);
      return;
    }

    // Supabase PKCE 코드 교환 (카카오/구글)
    const code = searchParams.get('code');

    if (code) {
      setCodeProcessed(true);
      const supabase = createAuthClient();

      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          if (exchangeError.message?.includes('code') || exchangeError.message?.includes('verifier')) {
            console.debug('PKCE 코드 이미 처리됨, 세션 감지 대기 중...');
            return;
          }
          console.error('PKCE 코드 교환 실패:', exchangeError.message);
          setStatus('error');
          setErrorMessage('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
          setTimeout(() => router.replace(getRedirectPath()), 3000);
        }
        // 성공 시 onAuthStateChange 가 세션을 감지하여 아래 useEffect 에서 처리
      });
      return;
    }

    // 코드가 없는 경우 - 이미 처리되었을 수 있음
  }, [searchParams, router, codeProcessed]);

  // AuthProvider 의 onAuthStateChange 가 세션을 감지하면 리다이렉트.
  // admin 경로라면 prepareAdminSession 으로 ws_* 값을 먼저 세팅.
  useEffect(() => {
    if (!loading && user) {
      const redirectPath = getRedirectPath();
      let cancelled = false;
      (async () => {
        const adminResult = await prepareAdminSession(redirectPath);
        if (cancelled) return;
        if (adminResult === 'pending') {
          setStatus('error');
          setErrorMessage('관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.');
          setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 2500);
          return;
        }
        if (adminResult === 'rejected') {
          setStatus('error');
          setErrorMessage('가입이 거절되었습니다. 관리자에게 문의하세요.');
          setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 2500);
          return;
        }
        if (adminResult === 'error') {
          setStatus('error');
          setErrorMessage('어드민 권한 확인에 실패했습니다. 다시 시도해주세요.');
          setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 2500);
          return;
        }
        setStatus('success');
        setTimeout(() => router.replace(redirectPath), 800);
      })();
      return () => { cancelled = true; };
    }

    // 로딩 완료 후 8초 이내에 세션이 없으면 타임아웃
    if (!loading && !user && status === 'processing') {
      const timeout = setTimeout(() => {
        setStatus('error');
        setErrorMessage('로그인 처리 시간이 초과되었습니다. 다시 시도해주세요.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [user, loading, router, status]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-wishes-bg">
      <div className="text-center space-y-4 p-8">
        {status === 'processing' && (
          <>
            <div className="w-12 h-12 mx-auto border-4 border-wishes-secondary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-gray-700">로그인 처리 중...</p>
            <p className="text-sm text-gray-500">잠시만 기다려주세요</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700">로그인 완료!</p>
            <p className="text-sm text-gray-500">이전 페이지로 이동합니다</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700">로그인 실패</p>
            <p className="text-sm text-gray-500">{errorMessage}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-wishes-bg">
          <div className="text-center space-y-4 p-8">
            <div className="w-12 h-12 mx-auto border-4 border-wishes-secondary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-gray-700">로그인 처리 중...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
