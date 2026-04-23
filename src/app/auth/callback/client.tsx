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
      } catch { /* private mode */ }
      return 'ok';
    } catch {
      return 'error';
    }
  };

  // Kakao / Naver custom OAuth flow 공통 핸들러.
  //   - code 를 서버 /api/auth/{provider} 에 POST → token_hash 받음
  //   - Supabase verifyOtp(token_hash, 'magiclink') 로 세션 생성
  //   - admin 경로면 prepareAdminSession 으로 ws_* 세팅 후 이동
  const handleCustomProvider = async (providerPath: '/api/auth/kakao' | '/api/auth/naver', code: string, state?: string) => {
    try {
      const res = await fetch(providerPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.token_hash) {
        setStatus('error');
        setErrorMessage(data.error || '소셜 로그인 처리 중 오류가 발생했습니다.');
        setTimeout(() => router.replace(getRedirectPath()), 3000);
        return;
      }
      const supabase = createAuthClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      });
      if (verifyError) {
        console.error('verifyOtp error:', verifyError.message);
        setStatus('error');
        setErrorMessage('세션 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
        setTimeout(() => router.replace(getRedirectPath()), 3000);
        return;
      }
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
      setTimeout(() => { void navigateAfterAuth(redirectPath); }, 800);
    } catch {
      setStatus('error');
      setErrorMessage('소셜 로그인 처리 중 오류가 발생했습니다.');
      setTimeout(() => router.replace(getRedirectPath()), 3000);
    }
  };

  // 2026-04-23: 소셜/이메일 로그인 직후 이름/연락처 누락 여부 확인. 누락이면
  //   /complete-profile 로 유도. admin_users(또는 profiles)가 name+phone 모두
  //   채워져야 "완성"으로 본다. /api/auth/me 응답의 name/phone 을 신뢰.
  const checkProfileComplete = async (): Promise<boolean> => {
    try {
      const supabase = createAuthClient();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return true; // 미로그인이면 이 gate 무시
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      const name = (data?.user?.name || '').trim();
      const phone = (data?.user?.phone || '').trim();
      return Boolean(name && phone);
    } catch {
      return true; // 확인 실패 시 진행 차단 않음
    }
  };
  const navigateAfterAuth = async (redirectPath: string) => {
    const complete = await checkProfileComplete();
    if (complete) {
      router.replace(redirectPath);
      return;
    }
    router.replace(`/complete-profile?return=${encodeURIComponent(redirectPath)}`);
  };

  useEffect(() => {
    if (codeProcessed) return;

    const provider = searchParams.get('provider');

    // Kakao OAuth 콜백 (커스텀 백엔드 경유)
    if (provider === 'kakao') {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      if (error) {
        setStatus('error');
        setErrorMessage('카카오 로그인이 취소되었습니다.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
        return;
      }
      if (!code) {
        setStatus('error');
        setErrorMessage('카카오 인증 정보가 없습니다.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
        return;
      }
      setCodeProcessed(true);
      handleCustomProvider('/api/auth/kakao', code, state || undefined);
      return;
    }

    // 네이버 OAuth 콜백
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

      // L-sec107: OAuth CSRF state 검증 (sessionStorage 경로 우선, admin-auth.html
      //   정적 페이지 경로는 ws_naver_state 쿠키가 서버 측에서 이미 검사).
      let expectedState: string | null = null;
      try {
        expectedState = sessionStorage.getItem('wishes-naver-oauth-state');
      } catch {
        expectedState = null;
      }
      const stateValid =
        expectedState === null ||
        (Boolean(expectedState) && Boolean(state) && expectedState.length === (state as string).length && expectedState === state);
      try {
        sessionStorage.removeItem('wishes-naver-oauth-state');
      } catch { /* ignore */ }
      if (!stateValid) {
        setCodeProcessed(true);
        setStatus('error');
        setErrorMessage('보안 검증에 실패했습니다. 네이버 로그인을 다시 시도해주세요.');
        setTimeout(() => router.replace(getRedirectPath()), 3000);
        return;
      }

      if (!code) {
        setStatus('error');
        setErrorMessage('네이버 인증 정보가 없습니다.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
        return;
      }
      setCodeProcessed(true);
      handleCustomProvider('/api/auth/naver', code, state || undefined);
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

    // Supabase PKCE 코드 교환 (구글 등 Supabase 네이티브 provider)
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
  }, [searchParams, router, codeProcessed]);

  // AuthProvider onAuthStateChange — 구글 등 일반 OAuth 의 세션 완료 처리
  useEffect(() => {
    if (!loading && user && !codeProcessed) {
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
        setTimeout(() => { void navigateAfterAuth(redirectPath); }, 800);
      })();
      return () => { cancelled = true; };
    }

    if (!loading && !user && status === 'processing' && !codeProcessed) {
      const timeout = setTimeout(() => {
        setStatus('error');
        setErrorMessage('로그인 처리 시간이 초과되었습니다. 다시 시도해주세요.');
        setTimeout(() => router.replace(getRedirectPath()), 2000);
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [user, loading, router, status, codeProcessed]);

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
