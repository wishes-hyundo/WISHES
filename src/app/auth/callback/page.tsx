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

  useEffect(() => {
    const provider = searchParams.get('provider');

    // 네이버 OAuth 콜백 처리
    if (provider === 'naver') {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage('네이버 로그인이 취소되었습니다.');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }

      if (code) {
        fetch('/api/auth/naver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.url) {
              window.location.href = data.url;
            } else {
              setStatus('error');
              setErrorMessage(data.error || '네이버 로그인 처리 중 오류가 발생했습니다.');
              setTimeout(() => router.replace('/'), 3000);
            }
          })
          .catch(() => {
            setStatus('error');
            setErrorMessage('네이버 로그인 처리 중 오류가 발생했습니다.');
            setTimeout(() => router.replace('/'), 3000);
          });
        return;
      }

      setStatus('error');
      setErrorMessage('네이버 인증 정보가 없습니다.');
      setTimeout(() => router.replace('/'), 2000);
      return;
    }

    // 에러 파라미터 확인
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || '로그인 중 오류가 발생했습니다.');
      setTimeout(() => router.replace('/'), 3000);
      return;
    }

    // Supabase PKCE 코드 교환 (카카오/구글)
    const code = searchParams.get('code');
    if (code) {
      const supabase = createAuthClient();
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          console.error('PKCE 코드 교환 실패:', exchangeError.message);
          setStatus('error');
          setErrorMessage('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
          setTimeout(() => router.replace('/'), 3000);
        }
        // 성공 시 onAuthStateChange가 세션을 감지하여 아래 useEffect에서 처리
      });
      return;
    }
  }, [searchParams, router]);

  // AuthProvider의 onAuthStateChange가 세션을 감지하면 리다이렉트
  useEffect(() => {
    if (!loading && user) {
      setStatus('success');
      const timer = setTimeout(() => router.replace('/'), 800);
      return () => clearTimeout(timer);
    }

    // 로딩 완료 후 8초 이내에 세션이 없으면 타임아웃
    if (!loading && !user && status === 'processing') {
      const timeout = setTimeout(() => {
        setStatus('error');
        setErrorMessage('로그인 처리 시간이 초과되었습니다. 다시 시도해주세요.');
        setTimeout(() => router.replace('/'), 2000);
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
            <p className="text-sm text-gray-500">메인 페이지로 이동합니다</p>
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

export default function AuthCallbackPage() {
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
