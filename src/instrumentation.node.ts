// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-observe1 (2026-04-23): Node runtime Sentry init.
//
// SENTRY_DSN 이 없으면 init() 은 no-op. enabled 가드로 prod 외 전송 차단.
// beforeSend: authorization/cookie 헤더 + IP + email 마스킹.
// ignoreErrors: 무시할 정상 예외 (AbortController 취소 등).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05'),
  profilesSampleRate: 0,
  ignoreErrors: [
    'AbortError',
    'The user aborted a request',
    'uid_timeout',
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
  ],
  beforeSend(event) {
    // PII/secret masking — headers
    if (event.request?.headers) {
      delete (event.request.headers as Record<string, unknown>).authorization;
      delete (event.request.headers as Record<string, unknown>).cookie;
      delete (event.request.headers as Record<string, unknown>)['x-admin-token'];
      delete (event.request.headers as Record<string, unknown>)['x-superadmin-token'];
    }
    // User IP / email 제거 (회원 식별자 없는 공개 트래픽만 유지)
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
    }
    // query string 에서 token/code/state 제거
    if (event.request?.query_string && typeof event.request.query_string === 'string') {
      event.request.query_string = event.request.query_string.replace(
        /(token|code|state|password|secret|key)=[^&]*/gi,
        '$1=REDACTED',
      );
    }
    return event;
  },
});
