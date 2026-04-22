// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-observe1 (2026-04-23): Edge runtime Sentry init.
//
// middleware / edge route 전용. Node 전용 모듈은 금지.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05'),
  ignoreErrors: ['AbortError', 'NEXT_NOT_FOUND', 'NEXT_REDIRECT'],
  beforeSend(event) {
    if (event.request?.headers) {
      delete (event.request.headers as Record<string, unknown>).authorization;
      delete (event.request.headers as Record<string, unknown>).cookie;
    }
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
    }
    return event;
  },
});
