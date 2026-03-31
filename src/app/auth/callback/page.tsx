'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const provider = searchParams.get('provider');
      const code = searchParams.get('code');

      // 네이버 OAuth 콜백
      if (provider === 'naver' && code) {
        try {
          const state = searchParams.get('state') || '';
          const resp = await fetch('/api/auth/naver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          });
          if (resp.ok) { router.replace('/'); return; }
        } catch (e) { console.error('Naver auth error:', e); }
        setError('네이버 로그인 처리 중 오류가 발생했습니다.');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }

      // Supabase OAuth (카카오, 구글) - PKCE 플로우
      const supabase = createAuthClient();

      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) { router.replace('/'); return; }
          console.error('Code exchange error:', exchangeError);
        } catch (e) { console.error('Auth callback error:', e); }
      }

      // URL 에러 파라미터 확인
      const errorParam = searchParams.get('error');
      const errorDesc = searchParams.get('error_description');
      if (errorParam) {
        console.error('OAuth error:', errorParam, errorDesc);
        setError(errorDesc || '로그인 중 오류가 발생했습니다.');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }

      // 세션 확인 (detectSessionInUrl으로 이미 처리된 경우)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { router.replace('/'); return; }

      setError('로그인 처리 중 오류가 발생했습니다.');
      setTimeout(() => router.replace('/'), 2000);
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center"><span className="text-red-500 text-xl">!</span></div>
            <p className="text-sm text-gray-600">{error}</p>
            <p className="text-xs text-gray-400">잠시 후 홈으로 이동합니다...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-wishes-secondary mx-auto" />
            <p className="text-sm text-gray-600">로그인 처리 중...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-wishes-secondary mx-auto" />
          <p className="text-sm text-gray-600">로그인 처리 중...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}