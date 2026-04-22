// ─────────────────────────────────────────────────────────────────────────
// auditLog — 어드민 변이 감사 로그 헬퍼
//
// H-1 (L-sec125, 2026-04-22): 단일 admin 토큰 유출 시 어떤 매물이 언제
// 어떤 계정으로 삭제/수정됐는지 복구 증거를 남긴다.
//
// 설계 의도 (TL;DR):
//   - DB 테이블 (admin_audit_log) 을 새로 만들면 migration + RLS + 잔여
//     운영 부담이 커진다. 현 단계는 Vercel Log → Sentry/Logflare 로 들어가는
//     console 형태 JSON 한 줄로 시작.
//   - 포맷은 Vercel 로그 수집 파이프라인에서 쉽게 파싱 가능한
//     `[AUDIT] {"...json..."}` 패턴으로 통일.
//   - 추후 DB 전환 시 이 함수 구현만 바꾸면 호출부는 무변경.
//
// 호출 규칙:
//   audit({
//     action: 'listing.delete',     // 도메인.동사 (짧게)
//     actor: { email, role, uid },  // verifyAdminAuthWithContext 결과
//     target: { type: 'listing', id: listingId },
//     ip,
//     meta: { reason: '...' },      // optional
//   });
//
// PII 주의: password/token/body 전체를 넣지 말 것. 식별자 + 요약만.
// ─────────────────────────────────────────────────────────────────────────

export type AuditActor = {
  email?: string | null;
  role?: string | null;
  uid?: string | null;
};

export type AuditTarget = {
  type: string;           // 'listing' | 'user' | 'subscriber' | ...
  id?: string | number | null;
};

export type AuditEvent = {
  action: string;
  actor?: AuditActor;
  target?: AuditTarget;
  ip?: string;
  status?: number;        // HTTP 응답 상태 (success/failure 구분)
  meta?: Record<string, unknown>;
};

// L-observe1 (2026-04-23): 중요 감사 이벤트 Sentry breadcrumb/message 전송.
//   denied/error 상태이거나 delete/권한변경 계열 action 은 Sentry 로도 올린다.
//   DSN 미설정이면 observe helper 는 no-op.
const SENTRY_FORWARD_ACTION_PATTERNS = [
  '.delete',
  '.patch.denied',
  '.status_update.denied',
  '.role_change',
  '.approve',
  '.reject',
];

function shouldForwardToSentry(event: AuditEvent): boolean {
  // 실패/차단 이벤트는 전부 올림
  if (typeof event.status === 'number' && event.status >= 400) return true;
  // 민감 액션 이름 매치
  return SENTRY_FORWARD_ACTION_PATTERNS.some((p) => event.action.includes(p));
}

export function audit(event: AuditEvent): void {
  try {
    const record = {
      ts: new Date().toISOString(),
      action: event.action,
      actorEmail: event.actor?.email ?? null,
      actorRole: event.actor?.role ?? null,
      actorUid: event.actor?.uid ?? null,
      targetType: event.target?.type ?? null,
      targetId: event.target?.id ?? null,
      ip: event.ip ?? null,
      status: event.status ?? null,
      meta: event.meta ?? null,
    };
    // 단일 라인 JSON — Vercel Log drain / Sentry ingest 에 안전
    console.log('[AUDIT]', JSON.stringify(record));

    // L-observe1: 중요 이벤트만 Sentry 로 포워딩 (noise 방지 + 검색 용이).
    if (shouldForwardToSentry(event)) {
      // require 대신 dynamic import 로 관측 모듈 지연 로드 (Edge 호환).
      void import('./observe').then(({ captureWarning, addBreadcrumb }) => {
        const tags = {
          action: event.action,
          role: event.actor?.role ?? 'anonymous',
          targetType: event.target?.type ?? 'none',
          status: event.status != null ? String(event.status) : 'unknown',
        };
        if (typeof event.status === 'number' && event.status >= 400) {
          void captureWarning(`audit.${event.action}`, {
            route: 'audit',
            tags,
            extra: { record },
          });
        } else {
          void addBreadcrumb('audit', event.action, record);
        }
      }).catch(() => {
        // observe 로딩 실패는 무시 — 요청 영향 없음
      });
    }
  } catch {
    // 로그 실패는 요청 자체를 막지 않는다
  }
}
