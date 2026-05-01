-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- audit_2026-05-02 — registry_raw 30일 만료 자동 삭제
--
-- 발견:
--   pr_r3_reports_2026-05-01.sql 가 registry_raw.expires_at + idx_registry_raw_expires
--   인덱스 + "30일 후 자동 삭제 (cron 별도)" 주석을 두었으나 실제 삭제 cron 부재.
--   PII 가 영구 누적될 위험 (개인정보보호법 위반 가능).
--
-- 처리:
--   pipa_anonymize_expired() 함수에 registry_raw 만료 행 삭제 단계 추가.
--   기존 cron `/api/cron/pipa-anonymize` (매일 19:00 KST) 에서 자동 실행됨.
--
-- 적용:
--   사장님이 Supabase SQL Editor 에서 수동 실행.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- pipa_anonymize_expired() 가 이미 존재한다면 BODY 만 갱신.
-- (리턴 타입 / 시그니처는 기존과 동일하게 유지)
CREATE OR REPLACE FUNCTION pipa_anonymize_expired()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymized_users INTEGER := 0;
  v_anonymized_audits INTEGER := 0;
  v_anonymized_consents INTEGER := 0;
  v_deleted_registry INTEGER := 0;
  v_result jsonb;
BEGIN
  -- ─────────────────────────────────────────────────────────
  -- 1) admin_users 비활성 3년 → email/name/phone NULL (PIPA 익명화)
  -- ─────────────────────────────────────────────────────────
  UPDATE admin_users
  SET email = NULL, name = NULL, phone = NULL,
      anonymized_at = NOW()
  WHERE last_login_at IS NOT NULL
    AND last_login_at < NOW() - INTERVAL '3 years'
    AND email IS NOT NULL;
  GET DIAGNOSTICS v_anonymized_users = ROW_COUNT;

  -- ─────────────────────────────────────────────────────────
  -- 2) admin_audit_log 5년 경과 → user_email NULL
  -- ─────────────────────────────────────────────────────────
  UPDATE admin_audit_log
  SET user_email = NULL
  WHERE ts < NOW() - INTERVAL '5 years'
    AND user_email IS NOT NULL;
  GET DIAGNOSTICS v_anonymized_audits = ROW_COUNT;

  -- ─────────────────────────────────────────────────────────
  -- 3) user_consents 6년 경과 → 익명화 (PIPA 의무 5년 + 1년 버퍼)
  -- ─────────────────────────────────────────────────────────
  UPDATE user_consents
  SET ip_address = NULL, user_agent = NULL
  WHERE created_at < NOW() - INTERVAL '6 years'
    AND ip_address IS NOT NULL;
  GET DIAGNOSTICS v_anonymized_consents = ROW_COUNT;

  -- ─────────────────────────────────────────────────────────
  -- 4) registry_raw 만료 (30일) → DELETE (PII 영구 보존 X)
  --    audit 2026-05-02: PR-R-3-B cron 가 INSERT 하는 등기부 raw 데이터.
  --    expires_at = INSERT 시각 + 30일 (테이블 default).
  -- ─────────────────────────────────────────────────────────
  DELETE FROM registry_raw
  WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted_registry = ROW_COUNT;

  v_result := jsonb_build_object(
    'anonymized_users', v_anonymized_users,
    'anonymized_audits', v_anonymized_audits,
    'anonymized_consents', v_anonymized_consents,
    'deleted_registry_raw', v_deleted_registry,
    'ts', NOW()
  );

  -- 감사로그에 기록 (이미 존재하는 경우)
  BEGIN
    INSERT INTO admin_audit_log (action, ts, meta)
    VALUES ('cron.pipa_anonymize_expired', NOW(), v_result);
  EXCEPTION WHEN OTHERS THEN
    -- audit log 실패 무시 (function 자체는 성공)
    NULL;
  END;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION pipa_anonymize_expired() IS
  'PIPA 의무 익명화 + registry_raw 30일 만료 삭제. 매일 cron 실행.';
