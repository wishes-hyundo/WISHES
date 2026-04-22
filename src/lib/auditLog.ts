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

    // L-sec146 (2026-04-23): DB 병행 기록 (best-effort, fire-and-forget).
    //   admin_audit_log 테이블이 존재하고 service_role 키가 있으면 insert.
    //   실패는 완전 무시 — console/Sentry 경로가 primary 이므로 회귀 없음.
    //   테이블 미생성 상태(migration 미실행)면 insert 실패 → catch 에서 조용히 무시.
    void writeAuditToDb(record).catch(() => { /* silent */ });
  } catch {
    // 로그 실패는 요청 자체를 막지 않는다
  }
}

// L-sec146: 동적 import 로 Supabase client 지연 로드 (Edge 호환 + cold-start 절약).
async function writeAuditToDb(record: {
  ts: string; action: string; actorEmail: string | null; actorRole: string | null;
  actorUid: string | null; targetType: string | null;
  targetId: string | number | null; ip: string | null;
  status: number | null; meta: Record<string, unknown> | null;
}): Promise<void> {
  // Edge runtime 은 supabase-js 대신 fetch 만. 환경 분기:
  if (typeof process === 'undefined') return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  try {
    // dynamic import 로 supabase-js 로드 (client bundle 에 포함 안 됨).
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    await supabase.from('admin_audit_log').insert({
      ts: record.ts,
      action: record.action,
      actor_email: record.actorEmail,
      actor_role: record.actorRole,
      actor_uid: record.actorUid,
      target_type: record.targetType,
      target_id: record.targetId != null ? String(record.targetId) : null,
      ip: record.ip,
      status: record.status,
      meta: record.meta,
    });
  } catch {
    // 테이블 없음 / 네트워크 실패 등 모든 오류 무시.
  }
}
