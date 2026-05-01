'use client';

/**
 * PR-B (RFC 0016) — useInfoRequest hook
 *
 * 사용자 정보 문의 (면적/가격/주소 NULL 매물) 전송.
 * - 클라이언트 rate limit (localStorage 1분)
 * - 서버 rate limit (IP 기준)
 * - 입력 sanitize 후 POST
 */

import { useState, useCallback } from 'react';

const RATE_LIMIT_KEY = 'wishes-info-req-last';
const RATE_LIMIT_MS = 60_000;

export type InfoRequestType = 'area' | 'price' | 'address' | 'other';

export interface InfoRequestPayload {
  listing_id: number;
  request_type: InfoRequestType;
  user_contact: string;
  user_message?: string;
}

export interface InfoRequestResult {
  ok: boolean;
  message?: string;
  error?: string;
  retry_after?: number;
}

function checkClientRateLimit(): { ok: boolean; retryAfter: number } {
  try {
    const last = window.localStorage.getItem(RATE_LIMIT_KEY);
    if (!last) return { ok: true, retryAfter: 0 };
    const elapsed = Date.now() - Number.parseInt(last, 10);
    if (elapsed >= RATE_LIMIT_MS) return { ok: true, retryAfter: 0 };
    return { ok: false, retryAfter: Math.ceil((RATE_LIMIT_MS - elapsed) / 1000) };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

function recordSubmission(): void {
  try {
    window.localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
  } catch {
    /* localStorage 차단 환경 — 서버 rate limit 만 의존 */
  }
}

export function useInfoRequest() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(
    async (payload: InfoRequestPayload): Promise<InfoRequestResult> => {
      setError(null);
      setSuccess(false);

      // 클라이언트 rate limit
      const rl = checkClientRateLimit();
      if (!rl.ok) {
        setError(`잠시 후 다시 시도해주세요 (${rl.retryAfter}초)`);
        return { ok: false, error: 'rate_limited', retry_after: rl.retryAfter };
      }

      setSubmitting(true);
      try {
        const res = await fetch(
          `/api/listings/${payload.listing_id}/info-request`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_type: payload.request_type,
              user_contact: payload.user_contact,
              user_message: payload.user_message,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errCode: string = data?.error || 'unknown';
          let userMsg = '문의 전송에 실패했습니다. 다시 시도해주세요.';
          if (errCode === 'invalid_contact') userMsg = '연락처 형식을 확인해주세요.';
          else if (errCode === 'listing_not_found') userMsg = '매물을 찾을 수 없습니다.';
          else if (errCode === 'rate_limited') userMsg = '잠시 후 다시 시도해주세요.';
          setError(userMsg);
          return { ok: false, error: errCode, retry_after: data?.retry_after };
        }

        recordSubmission();
        setSuccess(true);
        return { ok: true, message: data?.message };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'network_error';
        setError('네트워크 오류 — 다시 시도해주세요.');
        return { ok: false, error: msg };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { submit, submitting, error, success };
}
