/**
 * PR-R-3-A (RFC 0018 Phase 2.B) — Toss Payments client
 *
 * 사장님 사업자 (MID `KIO_wishesvlsk`) 활성화.
 * 사장님이 dashboard.tosspayments.com 에서 발급받은 키를 Vercel env 등록:
 *   - TOSS_CLIENT_KEY (공개, ck_...)
 *   - TOSS_SECRET_KEY (비공개, sk_...)
 *
 * 헌법: 카드/계좌 데이터 0 처리 (Toss 가 모두 처리, PCI DSS 준수).
 * 회귀: 환경변수 미설정 시 graceful disabled.
 */

const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || '';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_API_BASE = 'https://api.tosspayments.com';

export function isTossEnabled(): boolean {
  return !!(TOSS_CLIENT_KEY && TOSS_SECRET_KEY);
}

export function getTossClientKey(): string {
  return TOSS_CLIENT_KEY;
}

export interface TossConfirmRequest {
  payment_key: string;
  order_id: string;
  amount: number;
}

export interface TossPaymentInfo {
  status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'WAITING_FOR_DEPOSIT' | 'IN_PROGRESS' | 'EXPIRED';
  payment_key: string;
  order_id: string;
  total_amount: number;
  method?: string;
  approved_at?: string;
  receipt_url?: string;
}

export interface TossResult {
  ok: boolean;
  payment?: TossPaymentInfo;
  error?: string;
  reason?: string;
}

function basicAuthHeader(): string {
  // Toss: Basic base64(SECRET_KEY + ':')
  const token = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${token}`;
}

/**
 * 결제 승인 — success callback 또는 webhook 에서 호출.
 */
export async function confirmPayment(req: TossConfirmRequest): Promise<TossResult> {
  if (!isTossEnabled()) {
    return { ok: false, error: 'toss_not_configured', reason: 'TOSS_SECRET_KEY 미설정' };
  }
  try {
    const res = await fetch(`${TOSS_API_BASE}/v1/payments/confirm`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey: req.payment_key,
        orderId: req.order_id,
        amount: req.amount,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: errBody?.code || `toss_${res.status}`,
        reason: errBody?.message || res.statusText,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      payment: {
        status: data.status,
        payment_key: data.paymentKey,
        order_id: data.orderId,
        total_amount: data.totalAmount,
        method: data.method,
        approved_at: data.approvedAt,
        receipt_url: data.receipt?.url,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: 'fetch_error',
      reason: e instanceof Error ? e.message : 'unknown',
    };
  }
}

/**
 * 환불 — 등기부 발급 실패 / 분석 오류 시 자동 호출.
 */
export async function refundPayment(payment_key: string, reason: string): Promise<TossResult> {
  if (!isTossEnabled()) {
    return { ok: false, error: 'toss_not_configured' };
  }
  try {
    const res = await fetch(`${TOSS_API_BASE}/v1/payments/${payment_key}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancelReason: reason }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody?.code || `toss_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, payment: { status: data.status, payment_key: data.paymentKey, order_id: data.orderId, total_amount: data.totalAmount } };
  } catch (e) {
    return { ok: false, error: 'fetch_error', reason: e instanceof Error ? e.message : 'unknown' };
  }
}
