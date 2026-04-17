// 구독 해지 페이지 (T5-7)
// URL: /unsub?t=TOKEN
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Check, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function UnsubPage() {
  return (
    <div className="min-h-screen bg-wishes-bg flex items-center justify-center px-4 py-12">
      <Suspense fallback={<Loader2 className="animate-spin text-wishes-green" size={32} />}>
        <UnsubInner />
      </Suspense>
    </div>
  );
}

function UnsubInner() {
  const params = useSearchParams();
  const token = params.get('t') || '';

  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('유효하지 않은 링크입니다.');
    }
  }, [token]);

  const handleUnsub = async () => {
    if (!token || state === 'loading') return;
    setState('loading');
    try {
      const res = await fetch('/api/unsub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (json.success) {
        setState('done');
        setEmail(json.email || '');
      } else {
        setState('error');
        setMessage(json.error || '구독 해지에 실패했습니다.');
      }
    } catch (e: any) {
      setState('error');
      setMessage(e?.message || '네트워크 오류');
    }
  };

  return (
    <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-wishes-primary/10 mx-auto mb-5">
        <Mail className="w-6 h-6 text-wishes-primary" />
      </div>
      <h1 className="text-xl font-bold text-center text-wishes-primary mb-2">
        매물 알림 구독 해지
      </h1>
      <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
        WISHES 부동산의 신규 매물 알림 발송을 중단합니다.
      </p>

      {state === 'idle' && (
        <>
          <button
            type="button"
            onClick={handleUnsub}
            className="w-full py-3 rounded-xl bg-wishes-primary text-white font-bold hover:bg-wishes-secondary transition-colors"
          >
            구독 해지하기
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">
            해지 후에도 언제든 사이트에서 다시 구독하실 수 있습니다.
          </p>
        </>
      )}

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" /> 처리 중...
        </div>
      )}

      {state === 'done' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <p className="font-bold text-gray-800 mb-1">구독 해지 완료</p>
          {email && (
            <p className="text-sm text-gray-500 mb-4">
              <strong>{email}</strong> 주소로 더 이상 알림 메일이 발송되지 않습니다.
            </p>
          )}
          <Link
            href="/"
            className="inline-block text-sm text-wishes-primary font-semibold hover:underline"
          >
            홈으로 돌아가기 →
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-3">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="font-bold text-gray-800 mb-2">처리할 수 없습니다</p>
          <p className="text-sm text-gray-500 mb-4">{message}</p>
          <Link
            href="/"
            className="inline-block text-sm text-wishes-primary font-semibold hover:underline"
          >
            홈으로 돌아가기 →
          </Link>
        </div>
      )}
    </div>
  );
}
