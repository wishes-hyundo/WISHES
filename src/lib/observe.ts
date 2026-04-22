// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-observe1 (2026-04-23): observe 헬퍼
//
// route / lib 코드에서 "선택적" 으로 Sentry 로 이벤트를 전송하기 위한
// 얇은 wrapper. SENTRY_DSN 이 없으면 모든 함수는 no-op.
//
// 사용 예:
//   import { captureError, captureWarning, addBreadcrumb } from '@/lib/observe';
//   try { ... } catch (e) { captureError(e, { route: 'admin/listings' }); }
//
// 설계 원칙:
//   - 동기 실패 시 throw 하지 않음 (옵저버빌리티가 요청을 막으면 안 됨)
//   - dynamic import 로 Sentry SDK 를 request hot path 에서 지연 로드
//   - tag/context cap: Sentry 제한(key 32자/value 200자) 이내 자동 자르기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type TagLike = Record<string, string | number | boolean | undefined | null>;

function isEnabled(): boolean {
  return !!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production';
}

function sanitizeTags(tags?: TagLike): Record<string, string> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v === null || v === undefined) continue;
    const key = k.slice(0, 32);
    const val = String(v).slice(0, 200);
    out[key] = val;
  }
  return out;
}

export async function captureError(
  err: unknown,
  context?: { route?: string; tags?: TagLike; extra?: Record<string, unknown> },
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.withScope((scope) => {
      const tags = sanitizeTags({ route: context?.route, ...context?.tags });
      if (tags) scope.setTags(tags);
      if (context?.extra) scope.setExtras(context.extra);
      Sentry.captureException(err);
    });
  } catch {
    // 관측 실패는 무시
  }
}

export async function captureWarning(
  message: string,
  context?: { route?: string; tags?: TagLike; extra?: Record<string, unknown> },
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      const tags = sanitizeTags({ route: context?.route, ...context?.tags });
      if (tags) scope.setTags(tags);
      if (context?.extra) scope.setExtras(context.extra);
      Sentry.captureMessage(message.slice(0, 500));
    });
  } catch {
    // 관측 실패는 무시
  }
}

export async function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.addBreadcrumb({
      category: category.slice(0, 64),
      message: message.slice(0, 500),
      level: 'info',
      data,
    });
  } catch {
    // 관측 실패는 무시
  }
}
