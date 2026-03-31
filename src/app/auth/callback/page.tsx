'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('인증 처리 시작...');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (msg: string) => {
    setDebugInfo(prev => [...prev, new Date().toLocaleTimeString() + ' ' + msg]);
  };

  useEffect(() => {
    const handleCallback = async () => {
      const provider = searchParams.get('provider');
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const errorDesc = searchParams.get('error_description');

      addDebug('provider=' + (provider || 'none') + ', code=' + (code ? code.substring(0, 10) + '...' : 'none'));

      if (errorParam) {
        addDebug('OAuth error: ' + errorParam + ' - ' + errorDesc);
        setError(errorDesc || '로그인 중 오류가 발생했습니다.');
        setTimeout(() => router.replace('/'), 3000);
        return;
      }

      if (provider === 'naver' && code) {
        try {
          setStatus('네이버 인증 코드 수신 완료, 토큰 교환 중...');
          addDebug('네이버 API 호출 시작');
          const state = searchParams.get('state') || '';
          const resp = await fetch('/api/auth/naver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          });
          const data = await resp.json();
          addDebug('API 응답: ' + resp.status + ' ' + JSON.stringify(data).substring(0, 200));

          if (resp.ok && data.redirect) {
            setStatus('인증 성공! 로그인 완료 처리 중...');
            addDebug('verify 페이지로 리다이렉트');
            window.location.href = data.redirect;
            return;
          }
          if (resp.ok && data.success) {
            setStatus('로그인 성공!');
            router.replace('/');
            return;
          }
          addDebug('API 에러: ' + JSON.stringify(data));
          setError(data.error || '네이버 로그인 처리 중 오류가 발생했습니다.');
          setTimeout(() => router.replace('/'), 5000);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          addDebug('예외 발생: ' + errMsg);
          setError('네이버 로그인 처리 중 오류: ' + errMsg);
          setTimeout(() => router.replace('/'), 5000);
        }
        return;
      }

      const supabase = createAuthClient();
      if (code) {
        try {
          setStatus('인증 코드 교환 중...');
          addDebug('Supabase PKCE code exchange');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) {
            setStatus('로그인 성공!');
            router.replace('/');
            return;
          }
          addDebug('Exchange error: ' + exchangeError.message);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          addDebug('Auth error: ' + errMsg);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
        return;
      }
      setError('로그인 처리 중 오류가 발생했습니다.');
      setTimeout(() => router.replace('/'), 5000);
    };
    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto p-6">
        {error ? (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center"><span className="text-red-500 text-xl">!</span></div>
            <p className="text-base font-medium text-gray-800">{error}</p>
            <p className="text-xs text-gray-400">잠시 후 홈으로 이동합니다...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
            <p className="text-sm font-medium text-gray-700">{status}</p>
          </div>
        )}
        {debugInfo.length > 0 && (
          <div className="mt-6 text-left bg-gray-100 rounded-lg p-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-bold text-gray-500 mb-1">처리 로그:</p>
            {debugInfo.map((info, i) => (
              <p key={i} className="text-xs text-gray-500 font-mono">{info}</p>
            ))}
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
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
          <p className="text-sm text-gray-600">로그인 처리 중...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
