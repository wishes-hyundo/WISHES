-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 방문 예약 (appointments) 테이블 — #45
--
--   매물 상세 페이지에서 고객이 직접 방문 가능한 시간대를 제출
--   중개사는 어드민에서 예약 리스트를 확인/확정/취소하고 메모를 남긴다
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS appointments (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT REFERENCES listings(id) ON DELETE SET NULL,
  contact_id   BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  visit_date   DATE NOT NULL,
  visit_slot   TEXT NOT NULL,          -- 'morning' | 'afternoon' | 'evening' | 'HH:MM'
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'requested',
               -- 'requested' → 'confirmed' → 'completed' / 'cancelled' / 'no_show'
  agent_memo   TEXT,                    -- 중개사 내부 메모
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_visit_slot CHECK (
    visit_slot IN ('morning', 'afternoon', 'evening')
    OR visit_slot ~ '^[0-2][0-9]:[0-5][0-9]$'
  ),
  CONSTRAINT chk_status CHECK (
    status IN ('requested', 'confirmed', 'completed', 'cancelled', 'no_show')
  )
);

CREATE INDEX IF NOT EXISTS idx_appointments_visit_date
  ON appointments(visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_listing_id
  ON appointments(listing_id) WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments(status);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_appointments_updated_at ON appointments;
CREATE TRIGGER tr_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_appointments_updated_at();

-- RLS: 누구나 insert (리드 퍼널), 관리자는 service_role JWT 로 처리
--       (이 프로젝트는 admin 구분을 profiles.role 이 아닌 service_role 로 한다
--        — 기존 contacts/listings 정책 동일 패턴)
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can create appointment" ON appointments;
CREATE POLICY "anyone can create appointment" ON appointments
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin can read appointments" ON appointments;
DROP POLICY IF EXISTS "admin can update appointments" ON appointments;

DROP POLICY IF EXISTS "appointments_service_role_all" ON appointments;
CREATE POLICY "appointments_service_role_all" ON appointments
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE appointments IS '매물 방문 예약 (리드 연계 + 중개사 스케줄링)';
COMMENT ON COLUMN appointments.visit_slot IS 'morning|afternoon|evening 프리셋 or HH:MM 시각 지정';
COMMENT ON COLUMN appointments.status IS 'requested → confirmed → completed / cancelled / no_show';
