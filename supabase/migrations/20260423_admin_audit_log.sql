-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-sec146 (2026-04-23): admin_audit_log DB table
--
-- H-1 에서 console.log([AUDIT]) 로만 남기던 감사 로그를 DB 에도 병행
-- 기록한다. 목적:
--   1) PIPA/감사 대응용 장기 보존 (Vercel 로그는 기본 1~30일)
--   2) superadmin 이 /api/admin/audit-log/export 로 CSV 추출
--   3) 향후 Grafana/Metabase 등으로 대시보드 구성
--
-- 운영 부담 최소화:
--   - RLS 기본 허용 없음 (service_role 만 read/write 가능)
--   - INDEX: ts DESC, actor_email, action — 흔한 쿼리 패턴.
--   - 12 months 이상된 record 를 자동 삭제하는 cron (하단 코멘트) 별도 구성.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists public.admin_audit_log (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  action       text        not null,
  actor_email  text,
  actor_role   text,
  actor_uid    uuid,
  target_type  text,
  target_id    text,
  ip           text,
  status       integer,
  meta         jsonb
);

create index if not exists idx_admin_audit_log_ts on public.admin_audit_log (ts desc);
create index if not exists idx_admin_audit_log_actor_email on public.admin_audit_log (actor_email);
create index if not exists idx_admin_audit_log_action on public.admin_audit_log (action);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log (target_type, target_id);

-- RLS: service_role 만 접근. anon/authenticated 는 차단.
alter table public.admin_audit_log enable row level security;

-- 기존 동명 정책 제거 (idempotent 재실행 안전)
drop policy if exists admin_audit_log_service_only on public.admin_audit_log;

create policy admin_audit_log_service_only
  on public.admin_audit_log
  as permissive
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 보존 정책 (선택): 24개월 이상 record 자동 삭제.
-- Supabase Scheduled Functions (pg_cron) 이 활성화돼 있으면 아래를 실행:
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- select cron.schedule(
--   'admin_audit_log_prune_monthly',
--   '0 3 1 * *',                    -- 매월 1일 03:00
--   $$ delete from public.admin_audit_log where ts < now() - interval '24 months'; $$
-- );
