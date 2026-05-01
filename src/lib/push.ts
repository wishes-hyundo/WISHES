// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Web Push 서버 헬퍼 (A3, 2026-05-02)
//
// 사용처:
//   - /api/push/send — 단일/일괄 발송
//   - notify-matches cron — 이메일 + 푸시 동시
//
// 환경변수 (Vercel 등록 완료):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (클라이언트도 사용)
//   VAPID_PRIVATE_KEY             (서버 전용)
//   VAPID_SUBJECT                 (예: mailto:wishes@wishes.co.kr)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import webpush from 'web-push';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:wishes@wishes.co.kr';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not configured');
    return false;
  }
  try {
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.error('[push] setVapidDetails failed:', (e as { message?: string })?.message || e);
    return false;
  }
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

export interface PushResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  expired?: boolean;
}

/**
 * 단일 구독에 푸시 발송
 * statusCode 404/410 → 구독 만료 (expired=true) → caller 가 active=false 처리
 */
export async function sendPush(
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureConfigured()) {
    return { ok: false, error: 'vapid_not_configured' };
  }
  try {
    const result = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }, // 24h
    );
    return { ok: true, statusCode: result.statusCode };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    const expired = e.statusCode === 404 || e.statusCode === 410;
    return {
      ok: false,
      statusCode: e.statusCode,
      error: e.message || 'unknown',
      expired,
    };
  }
}

/**
 * 여러 구독에 일괄 발송
 * 만료된 endpoint 는 expiredEndpoints 로 반환 → caller 가 일괄 비활성화
 */
export async function sendPushBatch(
  subs: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<{ sent: number; expiredEndpoints: string[] }> {
  let sent = 0;
  const expiredEndpoints: string[] = [];
  for (const sub of subs) {
    const res = await sendPush(sub, payload);
    if (res.ok) sent++;
    else if (res.expired) expiredEndpoints.push(sub.endpoint);
  }
  return { sent, expiredEndpoints };
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY,
  );
}
