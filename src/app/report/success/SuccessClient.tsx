'use client';

/**
 * PR-R-3-A — Toss 결제 성공 callback
 * Toss success_url → 본 페이지 → /api/payments/toss/confirm 호출 → 결과 표시.
 */

import { useEffect, useState } from 'react';

interface SuccessClientProps {
  paymentKey: string;
  orderId: string;
  amount: string;
}

export default function SuccessClient({ paymentKey, orderId, amount }: SuccessClientProps) {
  const [status, setStatus] = useState<'confirming' | 'success' | 'failed'>('confirming');
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setError('결제 정보가 누락되었습니다.');
      setStatus('failed');
      return;
    }

    // 서버에 confirm 요청
    fetch('/api/payments/toss/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_key: paymentKey,
        order_id: orderId,
        amount: Number.parseInt(amount, 10),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.reason || data.error || '결제 승인 실패');
          setStatus('failed');
          return;
        }
        setReportId(data.report_id);
        setStatus('success');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '네트워크 오류');
        setStatus('failed');
      });
  }, [paymentKey, orderId, amount]);

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 mt-8">
      {status === 'confirming' && (
        <div className="text-center py-12">
          <div className="text-3xl mb-4">⏳</div>
          <p className="text-gray-700">결제 승인 중...</p>
          <p className="text-xs text-gray-400 mt-2">잠시만 기다려주세요</p>
        </div>
      )}

      {status === 'success' && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-xl font-bold text-green-900 mb-2">결제 완료</h1>
          <p className="text-sm text-green-800 mb-4">
            권리분석 진행 중입니다.<br />
            완료되면 입력하신 이메일로 PDF 보고서를 발송해드립니다.
          </p>
          <p className="text-xs text-green-700">예상 소요: 5-10분 (사장님 검토 후 발송)</p>
          {reportId && (
            <p className="text-xs text-gray-500 mt-3">주문 #{reportId}</p>
          )}
          <a
            href="/map"
            className="mt-6 inline-block rounded-lg bg-blue-600 text-white px-6 py-2 font-semibold hover:bg-blue-700"
          >
            매물 더 보기
          </a>
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-red-900 mb-2">결제 승인 실패</h1>
          <p className="text-sm text-red-800 mb-4">{error}</p>
          <p className="text-xs text-red-700 mb-4">결제가 진행됐다면 자동 환불됩니다.</p>
          <a
            href="/map"
            className="inline-block rounded-lg bg-gray-200 text-gray-800 px-6 py-2 font-semibold hover:bg-gray-300"
          >
            매물로 돌아가기
          </a>
        </div>
      )}
    </div>
  );
}
