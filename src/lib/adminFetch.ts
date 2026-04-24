// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// adminFetch — C-2 phase 3a (L-sec145, 2026-04-23)
//              + L-sec161 grace period (2026-04-23, 깨끗 재구현)
//
// 어드민 대시보드가 `/api/admin/**` 를 호출할 때 공통적으로 붙여야 하는
// 3가지를 래핑한다:
//   1) credentials: 'include'      → ws_session HttpOnly 쿠키 전송
//   2) X-CSRF-Token 헤더            → sessionStorage('ws_csrf') echo (phase 2 발급본)
//   3) Authorization: Bearer <JWT> → legacy 호환 (phase 3c 제거 예정)
//
// 응답 처리:
//   - 401 이 오면 세션 만료로 간주하고 /admin/admin-auth.html 로 이동.
//   - L-sec161: 로그인 직후 10초 이내 401 은 auto-redirect 억제.
//     (agent 역할 사용자가 /admin/ 진입 직후 여러 API 병렬 호출 → JWT 전파 race
//      로 일시적 401 발생 시 로그인 루프 방어.  이전 L-sec160 은 GitHub 웹
//      에디터 대용량 replace 한계로 중복 선언 bug → L-sec161 로 로컬 Edit 재구현.)
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

// L-sec161: 로그인 직후 grace period (ms).  ws_login_time 을 login 성공 시
// sessionStorage 에 저장해 두면 이 창 안에서 발생한 401 은 redirect 억제.
const LOGIN_GRACE_MS = 30_000; // L-session1: 10s → 30s (Vercel cold-start 최대 8s + 여유)

function isWithinLoginGrace(): boolean {
  const ts = safeGetSession('ws_login_time');
  if (!ts || !/^\d+$/.test(ts)) return false;
  const loginTs = parseInt(ts, 10);
  if (!loginTs) return false;
  return Date.now() - loginTs < LOGIN_GRACE_MS;
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
    // L-sec161: 로그인 직후 grace period — 일시적 401 연쇄 방어.
    if (isWithinLoginGrace()) {
      return response;
    }

    // L-session1 (2026-04-24): 이전엔 401 을 무조건 세션만료로 간주하고 즉시
    //   sessionStorage.clear() + 로그인 페이지로 redirect. 하지만 Vercel
    //   serverless cold-start 시 Supabase auth.getUser() stall 로 verifyAdminAuth
    //   가 간헐적으로 401 반환하는 현실이 있다. 이 경우 사용자는 세션이 멀쩡한데
    //   강제 로그아웃 당함 — 로그인을 계속 하게 되는 주요 원인.
    //
    //   이제 먼저 supabase.auth.refreshSession() 으로 토큰을 갱신 시도하고,
    //   성공하면 원래 요청을 한 번 재시도한다. 재시도도 401 이면 진짜 세션
    //   만료로 판정하여 redirect.
    try {
      if (typeof window !== 'undefined') {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          // 새 토큰으로 Authorization 헤더 갱신 후 재시도
          const retryHeaders = new Headers(headers);
          retryHeaders.set('authorization', 'Bearer ' + refreshed);
          const retryResp = await fetch(input, {
            ...rest,
            headers: retryHeaders,
            credentials: 'include',
          });
          if (retryResp.status !== 401) {
            return retryResp;
          }
          // refresh 해도 여전히 401 이면 진짜 만료 — 아래로 fallthrough 해서 redirect
        }
        window.sessionStorage.clear();
        window.location.href = '/admin/admin-auth.html';
      }
    } catch {
      /* noop */
    }
  }

  return response;
}

/**
 * L-session1 (2026-04-24): supabase 세션 강제 refresh.
 *   성공 시 ws_token / ws_login_time 을 재기록하고 새 access_token 리턴.
 *   실패 시 null. supabase-js 의 refreshSession 은 refresh_token 이 유효하면
 *   브라우저 내 어디서든 1회 호출로 새 access_token 을 얻을 수 있음.
 */
async function tryRefreshToken(): Promise<string | null> {
  try {
    // Dynamic import 로 circular import 회피 (adminFetch 가 lib 저층에 있음)
    const mod = await import('./supabase');
    const sb = mod.createAuthClient();
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data?.session?.access_token) return null;
    const tok = 'admin_bridge_' + data.session.access_token;
    const now = Date.now().toString();
    try {
      window.sessionStorage.setItem('ws_token', tok);
      window.sessionStorage.setItem('ws_login_time', now);
      window.localStorage.setItem('ws_token', tok);
      window.localStorage.setItem('ws_login_time', now);
    } catch { /* noop */ }
    return tok;
  } catch {
    return null;
  }
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
