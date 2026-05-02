-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- audit_2026-05-02 — registry_raw 30일 만료 자동 삭제 통합
--
-- 발견 (감사):
--   pr_r3_reports_2026-05-01.sql 가 registry_raw.expires_at + 인덱스를 두었으나
--   실제 DELETE cron 부재. PR #61 의 process-paid-reports cron 이 INSERT 만 하고
--   삭제 없음 → PII 영구 누적 위험.
--
-- 처리:
--   기존 pipa_anonymize_expired() (사장님 명령 2026-04-28 기반: contacts /
--   appointments PII 익명화) 를 보존하면서 registry_raw 만료 행 DELETE 단계 추가.
--   기존 cron `/api/cron/pipa-anonymize` (매일 KST) 가 자동 실행.
--
-- 적용 상태: 2026-05-02 이미 prod 적용 완료.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.pipa_anonymize_expired()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  c_contacts          bigint := 0;
  c_appoint           bigint := 0;
  c_registry_deleted  bigint := 0;
BEGIN
  -- ── 1) contacts: PII 만 익명화 (거래 통계 보존) ──
  WITH u AS (
    UPDATE public.contacts
    SET name  = '[익명-PIPA-3년]',
        phone = '[익명]',
        email = NULL
    WHERE retention_until IS NOT NULL
      AND retention_until < CURRENT_DATE
      AND name <> '[익명-PIPA-3년]'
    RETURNING 1
  ) SELECT count(*) INTO c_contacts FROM u;

  -- ── 2) appointments: 동일 익명화 ──
  WITH u AS (
    UPDATE public.appointments
    SET name  = '[익명-PIPA-3년]',
        phone = '[익명]',
        email = NULL
    WHERE retention_until IS NOT NULL
      AND retention_until < CURRENT_DATE
      AND name <> '[익명-PIPA-3년]'
    RETURNING 1
  ) SELECT count(*) INTO c_appoint FROM u;

  -- ── 3) registry_raw: 30일 만료 행 영구 삭제 (PII 보존 X, 개인정보보호법) ──
  --     audit 2026-05-02: PR-R-3-B cron 가 INSERT 하는 등기부 raw 데이터.
  --     expires_at = INSERT 시각 + 30일 (테이블 default).
  WITH d AS (
    DELETE FROM public.registry_raw
    WHERE expires_at < NOW()
    RETURNING 1
  ) SELECT count(*) INTO c_registry_deleted FROM d;

  -- ── audit log ──
  INSERT INTO public.admin_audit_log (action, target_type, meta)
  VALUES ('pipa_anonymize_run', 'system',
    jsonb_build_object(
      'contacts_anonymized',     c_contacts,
      'appointments_anonymized', c_appoint,
      'registry_raw_deleted',    c_registry_deleted,
      'policy', '사장님 2026-04-28 명령 — PII 만 익명화, 거래 기록 영구 보존. registry_raw 30일 만료 (audit 2026-05-02)',
      'measured_at', now()
    ));

  RETURN jsonb_build_object(
    'contacts_anonymized',     c_contacts,
    'appointments_anonymized', c_appoint,
    'registry_raw_deleted',    c_registry_deleted,
    'note', 'PII anonymized, registry_raw 30-day TTL applied'
  );
END;
$function$;

COMMENT ON FUNCTION public.pipa_anonymize_expired() IS
  'PIPA 의무 익명화 (contacts/appointments) + registry_raw 30일 만료 삭제. /api/cron/pipa-anonymize 매일 실행.';
