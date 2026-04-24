'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleVerify = async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (!tokenHash || !type) {
        setError('잘못된 인증 링크입니다.');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }

      const supabase = createAuthClient();

      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'magiclink' | 'email',
        });

        if (verifyError) {
          console.error('Verify error:', verifyError);
          setError('인증 처리 중 오류가 발생했습니다.');
          setTimeout(() => router.replace('/'), 2000);
          return;
        }

        // 인증 성공 - 홈으로 이동
        router.replace('/');
      } catch (e) {
        console.error('Verify error:', e);
        setError('인증 처리 중 오류가 발생했습니다.');
        setTimeout(() => router.replace('/'), 2000);
      }
    };

    handleVerify();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-500 text-xl">!</span>
            </div>
            <p className="text-sm text-gray-600">{error}</p>
            <p className="text-xs text-gray-400">잠시 후 홈으로 이동합니다...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-wishes-secondary mx-auto" />
            <p className="text-sm text-gray-600">네이버 로그인 처리 중...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-wishes-secondary mx-auto" />
            <p className="text-sm text-gray-600">인증 처리 중...</p>
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
