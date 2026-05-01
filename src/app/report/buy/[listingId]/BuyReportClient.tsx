'use client';

/**
 * PR-R-3-A — 권리분석 보고서 결제 페이지
 *
 * 흐름:
 *   1. 사용자 이메일 입력 + 약관 동의
 *   2. POST /api/reports/init → orderId 발급
 *   3. Toss SDK loadPaymentWidget() 호출 → 결제 창
 *   4. 결제 성공 → /report/[reportId] redirect
 *
 * Toss SDK: https://docs.tosspayments.com/sdk/widget
 */

import { useEffect, useState, useRef } from 'react';
import Script from 'next/script';

interface BuyReportClientProps {
  listingId: number;
}

interface InitResult {
  success: boolean;
  order_id?: string;
  report_id?: number;
  amount?: number;
  order_name?: string;
  customer_email?: string;
  error?: string;
  reason?: string;
}

declare global {
  interface Window {
    PaymentWidget?: (clientKey: string, customerKey: string) => unknown;
  }
}

export default function BuyReportClient({ listingId }: BuyReportClientProps) {
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tossReady, setTossReady] = useState(false);
  const widgetRef = useRef<unknown>(null);

  useEffect(() => {
    // Toss SDK 로드 후 widget 초기화
    if (!tossReady || !window.PaymentWidget) return;
    // PaymentWidget 인스턴스는 결제 시작 시 생성 (SDK 빠른 초기화 방지)
  }, [tossReady]);

  const handlePay = async () => {
    setError(null);
    if (!agreed) {
      setError('약관에 동의해주세요.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('이메일 형식을 확인해주세요.');
      return;
    }
    if (!window.PaymentWidget) {
      setError('결제 시스템 로딩 중 — 잠시 후 다시 시도해주세요.');
      return;
    }

    setLoading(true);
    try {
      // 1. 서버에 reports 레코드 생성 + orderId 발급
      const res = await fetch('/api/reports/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, user_email: email }),
      });
      const data: InitResult = await res.json();

      if (!data.success || !data.order_id) {
        setError(
          data.error === 'payment_not_configured'
            ? '결제 시스템 준비 중 — 사장님 활성화 후 이용 가능합니다.'
            : '주문 생성 실패 — 다시 시도해주세요.',
        );
        setLoading(false);
        return;
      }

      // 2. Toss 결제 창 호출
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';
      if (!clientKey) {
        setError('결제 시스템 설정 오류 — 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }

      const PaymentWidget = window.PaymentWidget!;
      const widget = PaymentWidget(clientKey, `wishes-customer-${data.report_id}`) as {
        renderPaymentMethods: (selector: string, info: { value: number }) => unknown;
        requestPayment: (req: {
          orderId: string;
          orderName: string;
          successUrl: string;
          failUrl: string;
          customerEmail?: string;
        }) => Promise<unknown>;
      };
      widgetRef.current = widget;

      await widget.requestPayment({
        orderId: data.order_id,
        orderName: data.order_name || '위시스 권리분석 보고서',
        successUrl: `${window.location.origin}/report/success`,
        failUrl: `${window.location.origin}/report/fail`,
        customerEmail: data.customer_email || email,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 시작 실패');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 mt-8">
      <Script
        src="https://js.tosspayments.com/v1/payment-widget"
        onLoad={() => setTossReady(true)}
        strategy="afterInteractive"
      />

      <h1 className="text-2xl font-bold mb-2">권리분석 보고서</h1>
      <p className="text-sm text-gray-600 mb-6">매물 #{listingId}</p>

      <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 mb-6">
        <h2 className="font-semibold mb-2">자동 분석 항목</h2>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>✓ 등기부등본 자동 발급</li>
          <li>✓ 소유권 이력 (이중매매 검증)</li>
          <li>✓ 근저당 / 가압류 / 경매 자동 감지</li>
          <li>✓ 위험 등급 (안전 / 주의 / 경고 / 위험)</li>
          <li>✓ PDF 보고서 이메일 발송</li>
        </ul>
      </div>

      <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-3 mb-6 text-xs text-yellow-900">
        ⚠️ 본 분석은 참고용입니다. 최종 매수 결정은 변호사 자문 + 현장 검증 후 진행하세요.
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="report-email" className="block text-sm font-medium mb-1">
            이메일 (보고서 발송) <span className="text-red-500">*</span>
          </label>
          <input
            id="report-email"
            type="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            required
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <span>
            <a href="/terms" target="_blank" className="underline text-blue-600">서비스 이용약관</a> 및{' '}
            <a href="/privacy" target="_blank" className="underline text-blue-600">개인정보처리방침</a> 동의 (필수)
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={loading || !agreed || !email.trim() || !tossReady}
          className="w-full rounded-lg bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? '결제 진행 중...' : '₩3,000 결제하기'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Toss Payments 보안 결제 — 카드 / 계좌 / 간편결제
        </p>
      </div>
    </div>
  );
}
