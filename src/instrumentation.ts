// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-observe1 (2026-04-23): Sentry + OTel 진입점.
//
// Next.js 15 instrumentation hook. `NEXT_RUNTIME` 에 따라 node/edge
// SDK 를 동적 로드. SENTRY_DSN 이 미설정이면 init 은 no-op.
//
// 환경 변수:
//   SENTRY_DSN            — 서버(Node) 런타임 DSN (prod only)
//   NEXT_PUBLIC_SENTRY_DSN — 브라우저 DSN (별도 project 권장)
//   SENTRY_RELEASE        — (optional) release 태깅
//   SENTRY_ENVIRONMENT    — (optional) prod/preview/dev (기본 NODE_ENV)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}

export const onRequestError = async (
  err: unknown,
  request: Request | { path?: string; method?: string; headers?: Record<string, string> },
  context: unknown,
) => {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRequestError(err, request as Parameters<typeof Sentry.captureRequestError>[1], context as Parameters<typeof Sentry.captureRequestError>[2]);
  } catch {
    // Sentry 미설치/미로딩 시 무시
  }
};
