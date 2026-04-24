-- ─────────────────────────────────────────────────────────────
-- 리드 CRM 파이프라인 상태 컬럼 추가
-- 목적: 상담 문의를 '접수/처리중/완료' 3단계에서
--       중개사 실무 CRM 관점의 6단계 파이프라인으로 확장
--
-- 기존 `status` 컬럼은 그대로 유지 (하위 호환) — 어드민 UI에서는
-- `pipeline_status`를 보조 컬럼으로 함께 표시/수정합니다.
-- ─────────────────────────────────────────────────────────────

-- 1. enum 타입 생성 (없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_pipeline_status') THEN
    CREATE TYPE contact_pipeline_status AS ENUM (
      'new',          -- 신규 접수 (default)
      'contacted',    -- 최초 연락 완료 (전화/문자 성공)
      'visit_booked', -- 현장 방문 일정 잡힘
      'contract',     -- 계약 진행 중
      'closed_won',   -- 계약 성사
      'closed_lost'   -- 이탈 / 실패
    );
  END IF;
END
$$;

-- 2. contacts 테이블에 컬럼 추가 (없을 때만)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS pipeline_status contact_pipeline_status NOT NULL DEFAULT 'new';

-- 3. 어드민에서 사용할 추적 필드 (처리 담당자 & 메모)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assignee TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;

-- 4. 인덱스 (대시보드 카운팅 성능)
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_status ON contacts(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at_status
  ON contacts(created_at DESC, pipeline_status);

-- 5. 기존 status('접수')를 new로 초기 매핑 (이미 default 'new'가 들어감)
-- 안전을 위해 명시적 백필:
UPDATE contacts
SET pipeline_status = CASE
  WHEN status = '완료'   THEN 'closed_won'::contact_pipeline_status
  WHEN status = '처리중' THEN 'contacted'::contact_pipeline_status
  ELSE 'new'::contact_pipeline_status
END
WHERE pipeline_status = 'new' AND status IS NOT NULL;

-- 6. 어드민 전용 RLS 정책은 기존 contacts RLS를 그대로 따름
--    (이 컬럼은 기존 정책 하에 자동으로 보호됨)

COMMENT ON COLUMN contacts.pipeline_status IS
  '리드 단계 — new→contacted→visit_booked→contract→closed_won/closed_lost';
COMMENT ON COLUMN contacts.assignee IS '담당 중개사 (admin 사용자 id 또는 이름)';
COMMENT ON COLUMN contacts.internal_note IS '내부 메모 (고객에게 노출되지 않음)';
COMMENT ON COLUMN contacts.last_followup_at IS '마지막 후속조치 시각';
