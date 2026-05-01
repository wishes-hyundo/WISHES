/**
 * PR-R-3 (RFC 0018 Phase 2.B) — Toss Payments client (스텁)
 *
 * 사장님 외부 등록 후 활성화:
 *   1. https://docs.tosspayments.com 사업자 인증 (3-5일)
 *   2. 정산 계좌 등록
 *   3. Vercel env TOSS_CLIENT_KEY (공개) + TOSS_SECRET_KEY (비공개) 등록
 *   4. PR-R-3-Activate (별도 PR) 에서 실제 결제 활성화
 *
 * 수수료: 거래당 3.0% (가입 0원)
 *
 * 헌법 §"안전한 결제": Toss 자체 부정거래 탐지 + RLS + Webhook 서명 검증.
 */

export interface TossPaymentRequest {
  order_id: string;          // wishes-report-{report_id}
  amount: number;            // 원 단위 (정수)
  order_name: string;        // "위시스 권리분석 보고서"
  customer_email?: string;
  success_url: string;
  fail_url: string;
}

export interface TossPaymentConfirmRequest {
  payment_key: string;       // Toss tid
  order_id: string;
  amount: number;
}

export interface TossPaymentResult {
  ok: boolean;
  payment_id?: string;
  status?: 'DONE' | 'FAILED' | 'CANCELED';
  approved_at?: string;
  error?: string;
  reason?: string;
}

const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || '';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

export function isTossEnabled(): boolean {
  return !!(TOSS_CLIENT_KEY && TOSS_SECRET_KEY);
}

export function getTossClientKey(): string {
  return TOSS_CLIENT_KEY;
}

/**
 * Toss 결제 승인 — webhook 또는 success callback 에서 호출.
 * 환경변수 미설정 시 graceful disabled.
 */
export async function confirmPayment(
  _req: TossPaymentConfirmRequest,
): Promise<TossPaymentResult> {
  if (!isTossEnabled()) {
    return {
      ok: false,
      error: 'toss_not_configured',
      reason: 'TOSS_SECRET_KEY 환경변수 미설정',
    };
  }

  // 실제 구현은 PR-R-3-Activate 별도 PR.
  //   1. POST https://api.tosspayments.com/v1/payments/confirm
  //      Authorization: Basic base64(SECRET_KEY + ':')
  //   2. 응답 검증 + DB UPDATE (reports.status = 'paid')
  //   3. CODEF 호출 트리거
  return {
    ok: false,
    error: 'toss_not_implemented',
    reason: 'PR-R-3-Activate 에서 실제 결제 활성화 예정',
  };
}

/**
 * 환불 — 등기부 발급 실패 / 분석 오류 시 자동 호출.
 */
export async function refundPayment(
  _payment_key: string,
  _reason: string,
): Promise<TossPaymentResult> {
  if (!isTossEnabled()) {
    return {
      ok: false,
      error: 'toss_not_configured',
    };
  }

  // 실제 구현은 PR-R-3-Activate.
  //   POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel
  return {
    ok: false,
    error: 'toss_not_implemented',
  };
}
