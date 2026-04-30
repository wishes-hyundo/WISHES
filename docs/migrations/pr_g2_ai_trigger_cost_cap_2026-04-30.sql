-- ════════════════════════════════════════════════════════════════════
-- PR-G2 — AI trigger 2 + cost cap (헌법 §116~119)
-- RFC: docs/RFC/0003-pr-g2-ai-trigger-cost-cap.md
-- 작성: 2026-04-30
-- 적용: Supabase MCP via Cowork
-- 의존: PR-A (#15) + PR-FIX2 (#14) 머지 완료
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- §1. ai_governance_log 테이블 (시계열 audit)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_governance_log (
  id bigserial PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('hallucination','cost','state','row_check')),
  payload jsonb NOT NULL,
  alert_level text CHECK (alert_level IN ('info','warn','critical') OR alert_level IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_governance_log_measured
  ON ai_governance_log (measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_governance_log_kind
  ON ai_governance_log (kind, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_governance_log_alert
  ON ai_governance_log (alert_level, measured_at DESC)
  WHERE alert_level IS NOT NULL;

COMMENT ON TABLE ai_governance_log IS
  'PR-G2 AI 거버넌스 audit log. 일별 hallucination/cost/state + row-level check 적재. PR-G3 에서 Resend 알림 연동.';

-- ─────────────────────────────────────────────────────────────────────
-- §2. ai_governance_state 싱글톤 (현재 차단 상태)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_governance_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_cap_usd numeric(10,2) NOT NULL DEFAULT 30.00,
  current_usage_usd numeric(10,2) NOT NULL DEFAULT 0,
  current_pct smallint NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  last_alert_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_governance_state (id, monthly_cap_usd)
VALUES (1, 30.00)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE ai_governance_state IS
  'PR-G2 싱글톤. 월 cap (§38 사장님 명시 $30) + 현재 사용율 + is_blocked. 애플리케이션이 AI 호출 전 SELECT 1 row.';

-- ─────────────────────────────────────────────────────────────────────
-- §3. Row trigger: ai_title/ai_description hallucination check
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION tr_listings_ai_hallucination_check_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  desc_len int;
  english_ratio float;
  flags text[] := '{}';
  trust_penalty smallint := 0;
BEGIN
  -- ai_description 들어왔거나 변경된 경우만 검사 (raw description은 무시 — 사용자 입력)
  IF NEW.ai_description IS NULL OR NEW.ai_description = '' THEN
    RETURN NEW;
  END IF;

  -- 'description' in ai_generated_fields 일 때만 체크 (사용자 직접 입력 보호)
  IF NEW.ai_generated_fields IS NULL OR NOT ('description' = ANY(NEW.ai_generated_fields)) THEN
    RETURN NEW;
  END IF;

  desc_len := length(NEW.ai_description);
  IF desc_len > 0 THEN
    english_ratio := length(regexp_replace(NEW.ai_description, '[^A-Za-z]', '', 'g'))::float / desc_len;
  ELSE
    english_ratio := 0;
  END IF;

  -- §3.1 짧은 description 의심
  IF desc_len < 30 THEN
    flags := array_append(flags, 'suspect_short');
    trust_penalty := trust_penalty + 10;
  END IF;

  -- §3.2 영어 비율 > 50% 의심 (한국어 매물 description)
  IF english_ratio > 0.5 THEN
    flags := array_append(flags, 'suspect_english');
    trust_penalty := trust_penalty + 10;
  END IF;

  -- §3.3 trust_score 차감 (NULL 안전)
  IF array_length(flags, 1) > 0 THEN
    NEW.trust_score := GREATEST(0, COALESCE(NEW.trust_score, 100) - trust_penalty);

    -- ai_generated_fields 에 flag 태그 추가 (중복 제거)
    NEW.ai_generated_fields := ARRAY(
      SELECT DISTINCT unnest(NEW.ai_generated_fields || flags)
    );

    -- log 적재 (id 가 INSERT 시 미정이라 row_check 는 trigger 안에서 raw 적재)
    INSERT INTO ai_governance_log (kind, payload, alert_level)
    VALUES ('row_check',
      jsonb_build_object(
        'listing_id', NEW.id,
        'flags', flags,
        'desc_len', desc_len,
        'english_ratio', english_ratio,
        'trust_penalty', trust_penalty
      ),
      'info'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_listings_ai_hallucination_check ON listings;
CREATE TRIGGER tr_listings_ai_hallucination_check
  BEFORE INSERT OR UPDATE OF ai_title, ai_description, ai_generated_fields ON listings
  FOR EACH ROW
  EXECUTE FUNCTION tr_listings_ai_hallucination_check_fn();

COMMENT ON TRIGGER tr_listings_ai_hallucination_check ON listings IS
  'PR-G2 §116. ai_description 들어올 때 짧음/영어비율 검사 → trust_score 차감 + ai_generated_fields flag 태그.';

-- ─────────────────────────────────────────────────────────────────────
-- §4. Wrapper 함수: ai_run_daily_governance()
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ai_run_daily_governance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  hallucination_result jsonb;
  cost_result jsonb;
  current_pct_calc smallint;
  state_alert text := NULL;
  state_blocked boolean := false;
  state_reason text := NULL;
  monthly_cap numeric(10,2);
  current_usd numeric(10,2);
BEGIN
  -- §4.1 hallucination 통계
  SELECT ai_hallucination_detect() INTO hallucination_result;
  INSERT INTO ai_governance_log (kind, payload, alert_level)
  VALUES ('hallucination', hallucination_result,
    CASE
      WHEN (hallucination_result->>'suspect_too_short')::int > 100 THEN 'warn'
      WHEN (hallucination_result->>'suspect_english_dominant')::int > 50 THEN 'warn'
      ELSE 'info'
    END);

  -- §4.2 비용 추정
  SELECT ai_cost_estimate_monthly() INTO cost_result;
  INSERT INTO ai_governance_log (kind, payload, alert_level)
  VALUES ('cost', cost_result, 'info');

  -- §4.3 cap % 계산 + state 갱신
  SELECT monthly_cap_usd INTO monthly_cap FROM ai_governance_state WHERE id = 1;
  current_usd := COALESCE((cost_result->>'estimated_cost_usd')::numeric, 0);

  IF monthly_cap > 0 THEN
    current_pct_calc := LEAST(100, ROUND(current_usd / monthly_cap * 100))::smallint;
  ELSE
    current_pct_calc := 0;
  END IF;

  -- §4.4 cap 도달 분기 (헌법 §117)
  IF current_pct_calc >= 100 THEN
    state_alert := 'critical';
    state_blocked := true;
    state_reason := 'monthly_cap_reached_100pct';
  ELSIF current_pct_calc >= 95 THEN
    state_alert := 'critical';
    state_blocked := true;
    state_reason := 'monthly_cap_95pct_block';
  ELSIF current_pct_calc >= 80 THEN
    state_alert := 'warn';
    state_blocked := false;
    state_reason := 'monthly_cap_80pct_warn';
  END IF;

  -- §4.5 state 갱신
  UPDATE ai_governance_state
  SET current_usage_usd = current_usd,
      current_pct = current_pct_calc,
      is_blocked = state_blocked,
      block_reason = state_reason,
      last_alert_at = CASE WHEN state_alert IS NOT NULL THEN now() ELSE last_alert_at END,
      updated_at = now()
  WHERE id = 1;

  -- §4.6 state 변동 log
  INSERT INTO ai_governance_log (kind, payload, alert_level)
  VALUES ('state',
    jsonb_build_object(
      'current_pct', current_pct_calc,
      'current_usd', current_usd,
      'monthly_cap_usd', monthly_cap,
      'is_blocked', state_blocked,
      'block_reason', state_reason
    ),
    state_alert);

  RETURN jsonb_build_object(
    'measured_at', now(),
    'hallucination', hallucination_result,
    'cost', cost_result,
    'state', jsonb_build_object(
      'current_pct', current_pct_calc,
      'is_blocked', state_blocked,
      'block_reason', state_reason
    )
  );
END;
$$;

COMMENT ON FUNCTION ai_run_daily_governance() IS
  'PR-G2 §116/§117 wrapper. 일 1회 cron — hallucination + cost 통계 + cap 도달 시 is_blocked 갱신. 알림 발송은 PR-G3 (Vercel cron + Resend).';

-- ─────────────────────────────────────────────────────────────────────
-- §5. cron 등록 — 매일 09:00 KST (UTC 00:00)
-- ─────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('ai_governance_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai_governance_daily');

SELECT cron.schedule(
  'ai_governance_daily',
  '0 0 * * *',
  $$SELECT ai_run_daily_governance();$$
);

-- ─────────────────────────────────────────────────────────────────────
-- §6. 즉시 1회 실행 (검증)
-- ─────────────────────────────────────────────────────────────────────

SELECT ai_run_daily_governance();

-- ─────────────────────────────────────────────────────────────────────
-- §7. ROLLBACK (긴급)
-- ─────────────────────────────────────────────────────────────────────
-- SELECT cron.unschedule('ai_governance_daily');
-- DROP TRIGGER IF EXISTS tr_listings_ai_hallucination_check ON listings;
-- DROP FUNCTION IF EXISTS tr_listings_ai_hallucination_check_fn();
-- DROP FUNCTION IF EXISTS ai_run_daily_governance();
-- DROP TABLE IF EXISTS ai_governance_state;
-- DROP TABLE IF EXISTS ai_governance_log;
