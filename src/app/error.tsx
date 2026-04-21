'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Global Error Boundary (#41)
//
//   Next.js App Router: 루트 error.tsx 는 app/* 내부 렌더링 중
//   잡히지 않은 예외를 이 컴포넌트로 라우팅한다. /admin 서브트리는
//   자체 admin/error.tsx 를 보유하므로 여기는 public 페이지 전용.
//
//   원칙: 예외 상황에서도 고객 이탈을 막고 리드 캡처를 유지한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, Phone, Sparkles, AlertTriangle } from 'lucide-react';
import InquiryModal from '@/components/InquiryModal';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [inquiryOpen, setInquiryOpen] = useState(false);

  useEffect(() => {
    // 에러 로깅 — Sentry 등 연동 시 이 지점에서 전송
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[GlobalError]', error?.digest || error?.message, error);
    }
  }, [error]);

  return (
    <>
      <main className="min-h-[70vh] flex items-center justify-center px-4 py-12 bg-gradient-to-b from-white to-wishes-cream">
        <div className="max-w-md w-full text-center">
          {/* 상단 아이콘 */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mb-5">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl md:text-2xl font-extrabold text-wishes-primary mb-2">
            일시적인 오류가 발생했습니다
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            잠시 후 다시 시도해주세요. 계속 발생하면 직접 문의 주시면 빠르게 도와드리겠습니다.
          </p>
          {error?.digest && (
            <p className="text-[10px] text-gray-400 mb-6 font-mono">ref: {error.digest}</p>
          )}

          {/* 기본 액션 */}
          <div className="flex flex-col sm:flex-row gap-2 justify-center mb-6">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-wishes-primary hover:bg-wishes-secondary text-white font-bold text-sm rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-wishes-primary font-semibold text-sm rounded-xl transition-colors"
            >
              <Home className="w-4 h-4" />
              홈으로
            </Link>
          </div>

          {/* 주 CTA — 리드 캡처 (직접 문의) */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-3">오류가 계속된다면 저희가 직접 연락드릴게요</p>
            <button
              type="button"
              onClick={() => setInquiryOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-wishes-primary hover:bg-wishes-secondary text-white font-bold text-sm rounded-full shadow-lg shadow-wishes-primary/25 transition-all active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              담당 중개사에게 문의
              <span className="inline-flex items-center px-2 py-0.5 ml-1 rounded-full bg-white/20 text-[10px] font-semibold tracking-wider">무료</span>
            </button>
          </div>
        </div>
      </main>

      <InquiryModal
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        context="consultation"
        source="/error"
        titleOverride="상담 문의"
      />
    </>
  );
