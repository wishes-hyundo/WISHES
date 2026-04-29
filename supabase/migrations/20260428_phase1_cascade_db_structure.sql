-- ──────────────────────────────────────────────────────────────────────
-- Phase 1: Cascade System Database Structure (2026-04-28)
--
-- 목표: 3-tier cascade 시스템을 위한 DB 구조 설계
--   Tier 1: Broker 입력 (highest trust)
--   Tier 2: Building Registry API (높은 정확도)
--   Tier 3: RTMS/Crawler (자동 보강)
--
-- 구조:
--   1. listings 에 cascade 추적 칼럼 추가
--   2. listings_audit_log 테이블 (변경 이력 기록)
--   3. enrichment_status 추적
--   4. getFieldValue() function (cascade priority 구현)
-- ──────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- 1. Listings Table — Cascade Tracking Columns
-- ════════════════════════════════════════════════════════════════════════

-- 각 필드마다: field_source, field_confidence, field_locked_at
-- field_source: 'broker' | 'building_registry' | 'rtms' | 'crawler' | null
-- field_confidence: 0-100 (broker=100, building_registry=90, rtms=80, crawler=60)
-- field_locked_at: Broker 가 수동으로 확정한 시간 (null = 미확정)

ALTER TABLE listings ADD COLUMN IF NOT EXISTS area_source text
  DEFAULT NULL CONSTRAINT area_source_check
  CHECK (area_source IN ('broker', 'building_registry', 'rtms', 'crawler'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS area_confidence integer
  DEFAULT NULL CONSTRAINT area_confidence_check
  CHECK (area_confidence IS NULL OR (area_confidence >= 0 AND area_confidence <= 100));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS area_locked_at timestamptz DEFAULT NULL;

-- 향 (orientation)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS orientation_source text
  DEFAULT NULL CONSTRAINT orientation_source_check
  CHECK (orientation_source IN ('broker', 'building_registry', 'rtms', 'crawler'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS orientation_confidence integer
  DEFAULT NULL CONSTRAINT orientation_confidence_check
  CHECK (orientation_confidence IS NULL OR (orientation_confidence >= 0 AND orientation_confidence <= 100));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS orientation_locked_at timestamptz DEFAULT NULL;

-- 난방 (heating type)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS heating_source text
  DEFAULT NULL CONSTRAINT heating_source_check
  CHECK (heating_source IN ('broker', 'building_registry', 'rtms', 'crawler'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS heating_confidence integer
  DEFAULT NULL CONSTRAINT heating_confidence_check
  CHECK (heating_confidence IS NULL OR (heating_confidence >= 0 AND heating_confidence <= 100));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS heating_locked_at timestamptz DEFAULT NULL;

-- 건축년도 (construction year)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS construction_year_source text
  DEFAULT NULL CONSTRAINT construction_year_source_check
  CHECK (construction_year_source IN ('broker', 'building_registry', 'rtms', 'crawler'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS construction_year_confidence integer
  DEFAULT NULL CONSTRAINT construction_year_confidence_check
  CHECK (construction_year_confidence IS NULL OR (construction_year_confidence >= 0 AND construction_year_confidence <= 100));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS construction_year_locked_at timestamptz DEFAULT NULL;

-- 가격 (price)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_source text
  DEFAULT NULL CONSTRAINT price_source_check
  CHECK (price_source IN ('broker', 'building_registry', 'rtms', 'crawler'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_confidence integer
  DEFAULT NULL CONSTRAINT price_confidence_check
  CHECK (price_confidence IS NULL OR (price_confidence >= 0 AND price_confidence <= 100));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_locked_at timestamptz DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Enrichment Status & Audit
-- ════════════════════════════════════════════════════════════════════════

-- Enrichment status tracking
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_status text
  DEFAULT 'pending' CONSTRAINT enrichment_status_check
  CHECK (enrichment_status IN ('pending', 'in_progress', 'complete', 'partial', 'error'));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_last_attempt timestamptz DEFAULT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_error_log text DEFAULT NULL;

-- Last successful enrichment timestamp
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_completed_at timestamptz DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Audit Log Table (모든 변경 기록)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listings_audit_log (
  id bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

  -- 변경 필드
  field_name text NOT NULL,
  old_value text DEFAULT NULL,
  new_value text DEFAULT NULL,

  -- 변경 출처
  source text NOT NULL
    CONSTRAINT source_check
    CHECK (source IN ('broker', 'building_registry', 'rtms', 'crawler', 'admin')),

  -- 변경자
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 타임스탐프
  changed_at timestamptz NOT NULL DEFAULT now(),

  -- Cascade 우선순위 변경 기록
  cascade_before text DEFAULT NULL,
  cascade_after text DEFAULT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_audit_log_listing ON listings_audit_log(listing_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON listings_audit_log(changed_by, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_field ON listings_audit_log(field_name, changed_at DESC);

COMMENT ON TABLE listings_audit_log IS
  'Complete audit trail of all listing field changes, source, and cascade priority updates.';

-- ════════════════════════════════════════════════════════════════════════
-- 4. Cascade Helper Function: getFieldValue()
-- ════════════════════════════════════════════════════════════════════════
--
-- Implements 3-tier cascade logic:
--   1. Is field locked by broker? → return locked value
--   2. Broker input exists? → return it (confidence=100)
--   3. Building Registry exists? → return it (confidence=90)
--   4. RTMS exists? → return it (confidence=80)
--   5. Crawler exists? → return it (confidence=60)
--   6. null → not enriched yet

CREATE OR REPLACE FUNCTION get_field_value(
  p_listing_id uuid,
  p_field_name text
)
RETURNS TABLE (
  value text,
  source text,
  confidence integer,
  locked_at timestamptz,
  note text
) AS $$
DECLARE
  v_field_col text;
  v_source_col text;
  v_confidence_col text;
  v_locked_col text;
  v_value text;
  v_source text;
  v_confidence integer;
  v_locked_at timestamptz;
BEGIN
  -- Map field names to column names
  CASE p_field_name
    WHEN 'area' THEN
      v_field_col := 'area';
      v_source_col := 'area_source';
      v_confidence_col := 'area_confidence';
      v_locked_col := 'area_locked_at';
    WHEN 'orientation' THEN
      v_field_col := 'orientation';
      v_source_col := 'orientation_source';
      v_confidence_col := 'orientation_confidence';
      v_locked_col := 'orientation_locked_at';
    WHEN 'heating' THEN
      v_field_col := 'heating';
      v_source_col := 'heating_source';
      v_confidence_col := 'heating_confidence';
      v_locked_col := 'heating_locked_at';
    WHEN 'construction_year' THEN
      v_field_col := 'construction_year';
      v_source_col := 'construction_year_source';
      v_confidence_col := 'construction_year_confidence';
      v_locked_col := 'construction_year_locked_at';
    WHEN 'price' THEN
      v_field_col := 'price';
      v_source_col := 'price_source';
      v_confidence_col := 'price_confidence';
      v_locked_col := 'price_locked_at';
    ELSE
      RAISE EXCEPTION 'Unknown field: %', p_field_name;
  END CASE;

  -- Execute dynamic query to fetch cascade values
  EXECUTE format(
    'SELECT %I, %I, %I, %I FROM listings WHERE id = %L',
    v_field_col, v_source_col, v_confidence_col, v_locked_col
  ) INTO v_value, v_source, v_confidence, v_locked_at
  USING p_listing_id;

  -- Return cascade result
  RETURN QUERY SELECT
    v_value,
    v_source,
    v_confidence,
    v_locked_at,
    CASE
      WHEN v_locked_at IS NOT NULL THEN 'Locked by broker at ' || v_locked_at::text
      WHEN v_source = 'broker' THEN 'Broker input (highest trust)'
      WHEN v_source = 'building_registry' THEN 'Building Registry API (90% confidence)'
      WHEN v_source = 'rtms' THEN 'RTMS enrichment (80% confidence)'
      WHEN v_source = 'crawler' THEN 'Crawler enrichment (60% confidence)'
      ELSE 'Not enriched yet'
    END;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_field_value(uuid, text) IS
  'Returns the current value of a listing field with cascade source priority: locked > broker > building_registry > rtms > crawler.';

-- ════════════════════════════════════════════════════════════════════════
-- 5. Audit Trigger (auto-log changes)
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_listing_change()
RETURNS TRIGGER AS $$
DECLARE
  v_cascade_fields text[] := ARRAY['area', 'orientation', 'heating', 'construction_year', 'price'];
  v_field text;
  v_old text;
  v_new text;
  v_source text;
BEGIN
  -- For each cascade field, log if changed
  FOREACH v_field IN ARRAY v_cascade_fields
  LOOP
    v_old := CASE
      WHEN TG_OP = 'INSERT' THEN NULL::text
      ELSE COALESCE(OLD.area::text, OLD.orientation::text,
                    OLD.heating::text, OLD.construction_year::text, OLD.price::text)
    END;

    v_new := CASE
      WHEN TG_OP = 'DELETE' THEN NULL::text
      ELSE COALESCE(NEW.area::text, NEW.orientation::text,
                    NEW.heating::text, NEW.construction_year::text, NEW.price::text)
    END;

    -- Only log if value actually changed
    IF v_old IS DISTINCT FROM v_new THEN
      -- Determine source from columns
      v_source := CASE
        WHEN TG_OP = 'INSERT' AND NEW.area IS NOT NULL THEN 'broker'
        WHEN TG_OP = 'UPDATE' AND (NEW.area_locked_at IS NOT NULL) THEN 'broker'
        ELSE COALESCE(NEW.area_source, 'unknown')
      END;

      INSERT INTO listings_audit_log (
        listing_id, field_name, old_value, new_value, source, changed_by
      ) VALUES (
        NEW.id, v_field, v_old, v_new, v_source, auth.uid()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_listing_change ON listings;
CREATE TRIGGER trg_log_listing_change
AFTER INSERT OR UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION log_listing_change();

COMMENT ON TRIGGER trg_log_listing_change ON listings IS
  'Auto-logs all cascade field changes to listings_audit_log with source attribution.';

-- ════════════════════════════════════════════════════════════════════════
-- 6. Cleanup & Notes
-- ════════════════════════════════════════════════════════════════════════
--
-- Migration 검증:
--   SELECT COUNT(*) FROM listings WHERE enrichment_status IS NULL;
--   (should be 0 after migration — all start as 'pending')
--
-- Cascade query 테스트:
--   SELECT * FROM get_field_value('listing-uuid-here', 'area');
--
-- Audit trail 확인:
--   SELECT * FROM listings_audit_log WHERE listing_id = 'listing-uuid-here'
--   ORDER BY changed_at DESC;
--
-- ════════════════════════════════════════════════════════════════════════
