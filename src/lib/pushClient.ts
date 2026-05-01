// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pushClient.ts — 브라우저 Push 구독/해지 헬퍼 (A3, 2026-05-02)
//
// 사용처:
//   - AlertSubscribeModal.tsx — 저장 검색 푸시 옵션
//   - PushSubscribeButton.tsx — 단독 구독 버튼 (차후)
//
// 주의:
//   - VAPID public key 는 빌드 타임에 inline (NEXT_PUBLIC_*)
//   - 페이지에서 처음 호출 시 sw.js 등록 → permission 요청 → subscribe → 서버 등록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    return null;
  }
}

export interface SubscribeOptions {
  email?: string;
  savedSearchId?: number;
  authToken?: string;
}

export interface SubscribeResult {
  ok: boolean;
  error?: string;
  status?: NotificationPermission | 'unsupported' | 'no_vapid';
}

/**
 * 푸시 구독 - 권한 요청 + 등록 + 서버 저장.
 * 사용자 액션(클릭) 핸들러 안에서 호출해야 권한 요청 prompt 정상 동작.
 */
export async function subscribePush(opts: SubscribeOptions = {}): Promise<SubscribeResult> {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, error: '푸시 키 미설정', status: 'no_vapid' };
  }
  if (!isPushSupported()) {
    return { ok: false, error: '이 브라우저는 푸시를 지원하지 않습니다', status: 'unsupported' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, error: '알림 권한이 거부되었습니다', status: perm };
  }
  const reg = await ensureServiceWorker();
  if (!reg) {
    return { ok: false, error: 'Service Worker 등록 실패' };
  }
  let sub: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message || '구독 실패';
    return { ok: false, error: msg };
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) {
    return { ok: false, error: '구독 정보 누락' };
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`;
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        email: opts.email || null,
        savedSearchId: opts.savedSearchId ?? null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' }));
      return { ok: false, error: err?.error || '서버 등록 실패' };
    }
  } catch (e) {
    return { ok: false, error: '네트워크 오류' };
  }
  return { ok: true };
}

/**
 * 푸시 구독 해지 - 브라우저 + 서버 양쪽 정리
 */
export async function unsubscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return { ok: true };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as { message?: string })?.message || 'unknown' };
  }
}

/**
 * 현재 구독 상태 (UI 토글 표시용)
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
