/**
 * PR-R-3-A — POST /api/payments/toss/confirm
 *
 * Toss success callback 호출됨 — 결제 승인 + reports.status='paid'.
 *
 * 흐름:
 *   1. /report/buy 페이지에서 Toss SDK 호출 → 결제 창
 *   2. 결제 완료 → success_url 콜백 (paymentKey, orderId, amount)
 *   3. 클라이언트가 본 endpoint 호출 → 서버에서 confirmPayment() (Toss 검증)
 *   4. reports.status='paid' + payment_id 저장
 *   5. CODEF 호출 트리거 (env 등록 후) — 별도 PR-R-3-B
 *
 * 보안:
 *   - amount 검증 (DB reports.amount_krw 와 일치)
 *   - paymentKey 검증 (Toss API)
 *   - 중복 confirm 방지 (status === 'pending' 만)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { confirmPayment, isTossEnabled } from '@/lib/toss-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

interface ConfirmRequest {
  payment_key: string;
  order_id: string;
  amount: number;
}

export async function POST(request: NextRequest) {
  if (!isTossEnabled()) {
    return NextResponse.json(
      { error: 'payment_not_configured' },
      { status: 503 },
    );
  }

  let body: ConfirmRequest;
  try {
    body = (await request.json()) as ConfirmRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.payment_key || !body.order_id || !Number.isFinite(body.amount)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // order_id 형식 검증 + report_id 추출
  const match = body.order_id.match(/^wishes-report-(\d+)$/);
  if (!match) {
    return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
  }
  const reportId = Number.parseInt(match[1], 10);

  const supabase = createServerClient();

  // reports 레코드 검증
  const { data: report, error: fetchErr } = await supabase
    .from('reports')
    .select('id, status, amount_krw, payment_id')
    .eq('id', reportId)
    .single();

  if (fetchErr || !report) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 });
  }

  // 중복 confirm 방지
  if (report.status !== 'pending') {
    return NextResponse.json({
      success: true,
      already_confirmed: true,
      status: report.status,
      payment_id: report.payment_id,
    });
  }

  // 금액 검증 (사용자 클라이언트 변조 방어)
  if (Number(body.amount) !== Number(report.amount_krw)) {
    console.error('[toss/confirm] amount mismatch', {
      report_id: reportId,
      expected: report.amount_krw,
      received: body.amount,
    });
    return NextResponse.json(
      { error: 'amount_mismatch' },
      { status: 400 },
    );
  }

  // Toss API 호출
  const result = await confirmPayment({
    payment_key: body.payment_key,
    order_id: body.order_id,
    amount: body.amount,
  });

  if (!result.ok || !result.payment) {
    // 결제 실패 — reports.status = 'failed'
    await supabase
      .from('reports')
      .update({
        status: 'failed',
        failed_reason: result.error || 'toss_confirm_failed',
      })
      .eq('id', reportId);
    return NextResponse.json(
      {
        error: result.error || 'toss_confirm_failed',
        reason: result.reason,
      },
      { status: 400 },
    );
  }

  // 결제 성공 — reports.status = 'paid'
  const { error: updErr } = await supabase
    .from('reports')
    .update({
      status: 'paid',
      payment_id: result.payment.payment_key,
      payment_method: result.payment.method || null,
    })
    .eq('id', reportId);

  if (updErr) {
    console.error('[toss/confirm] update error', updErr);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // CODEF 호출 트리거 — /api/cron/process-paid-reports 가 5분 간격으로
  // status='paid' 보고서를 픽업하여 fetchRegistry() + analyzeRights() 자동 실행.
  // CODEF env 미설정 시 cron 이 graceful no-op (paid 유지) — env 등록 후 자동 활성화.
  // PR-R-3-B (2026-05-02) 완료.

  return NextResponse.json({
    success: true,
    report_id: reportId,
    status: 'paid',
    payment_method: result.payment.method,
    receipt_url: result.payment.receipt_url,
    next_step: '권리분석 진행 중 — 사장님 검토 후 이메일 발송 (CODEF 활성화 후)',
  });
}
