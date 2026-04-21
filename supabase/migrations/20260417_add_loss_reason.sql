-- ─────────────────────────────────────────────────────────────
-- 리드 이탈 사유 컬럼 추가 (closed_lost 분석용)
-- 목적: `closed_lost` 단계에서 왜 이탈했는지 원인을 집계해
--       어드민이 "가장 많은 이탈 사유"를 한눈에 확인하도록
-- ─────────────────────────────────────────────────────────────

-- 1. enum 타입 생성 (없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_loss_reason') THEN
    CREATE TYPE contact_loss_reason AS ENUM (
      'price',        -- 가격 (고객 예산 초과)
      'inventory',    -- 매물 부족 (조건에 맞는 매물 없음)
      'timing',       -- 타이밍 (이사 시점 불일치)
      'changed_mind', -- 고객 변심 (계약 포기)
      'other'         -- 기타
    );
  END IF;
END
$$;

-- 2. contacts 테이블에 컬럼 추가 (없을 때만)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS loss_reason contact_loss_reason;

-- 3. 집계 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_contacts_loss_reason
  ON contacts(loss_reason)
  WHERE loss_reason IS NOT NULL;

COMMENT ON COLUMN contacts.loss_reason IS
  '이탈 사유 — pipeline_status=closed_lost 일 때만 유효 (price/inventory/timing/changed_mind/other)';
