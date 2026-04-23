// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// adminFetch — C-2 phase 3a (L-sec145, 2026-04-23)
//
// 어드민 대시보드가 `/api/admin/**` 를 호출할 때 공통적으로 붙여야 하는
// 3가지를 래핑한다:
//   1) credentials: 'include'      → ws_session HttpOnly 쿠키 전송
//   2) X-CSRF-Token 헤더            → sessionStorage('ws_csrf') echo (phase 2 발급본)
//   3) Authorization: Bearer <JWT> → legacy 호환 (phase 3c 제거 예정)
//
// 호출부 전환 전략:
//   - phase 3a (본 커밋): wrapper 만 추가. 기존 fetch() 호출은 건드리지 않음.
//   - phase 3b: admin 페이지를 점진적으로 adminFetch 로 전환.
//   - phase 3c: legacy Bearer fallback 제거 + sessionStorage('ws_token') 삭제.
//
// 사용 예:
//   import { adminFetch } from '@/lib/adminFetch';
//   const r = await adminFetch('/api/admin/listings', { method: 'POST', body });
//
// 응답 처리:
//   - 401 이 오면 세션 만료로 간주하고 /admin/admin-auth.html 로 이동.
//   - fetch 네트워크 오류는 그대로 throw.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type AdminFetchOptions = RequestInit & {
  /** 401 수신 시 자동 리다이렉트 여부 (기본: true). 배경 polling 등에서는 끌 수 있음. */
  redirectOn401?: boolean;
};

function safeGetSession(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function adminFetch(
  input: RequestInfo | URL,
  init: AdminFetchOptions = {},
): Promise<Response> {
  const { redirectOn401 = true, headers: hdrsInit, ...rest } = init;

  // 기존 headers 병합 (Headers/객체/배열 모두 허용)
  const headers = new Headers(hdrsInit as HeadersInit | undefined);

  // JSON body 기본 Content-Type
  if (rest.body && !headers.has('content-type')) {
    const isString = typeof rest.body === 'string';
    if (isString) headers.set('content-type', 'application/json');
  }

  // 1) legacy Bearer (phase 3c 에서 제거)
  const token = safeGetSession('ws_token');
  if (token && !headers.has('authorization')) {
    headers.set('authorization', 'Bearer ' + token);
  }

  // 2) CSRF double-submit echo
  const csrf = safeGetSession('ws_csrf');
  if (csrf && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', csrf);
  }

  const response = await fetch(input, {
    ...rest,
    headers,
    // 3) HttpOnly 쿠키 전송
    credentials: 'include',
  });

  if (response.status === 401 && redirectOn401) {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.clear();
        window.location.href = '/admin/admin-auth.html';
      }
    } catch {
      /* noop */
    }
  }

  return response;
}

/** 편의: JSON 파싱까지 한 번에. non-2xx 는 throw. */
export async function adminFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: AdminFetchOptions = {},
): Promise<T> {
  const r = await adminFetch(input, init);
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      const j = await r.json();
      msg = (j?.error || j?.message || msg) as string;
    } catch {
      /* non-json body */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}
