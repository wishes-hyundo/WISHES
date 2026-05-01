-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PR-R-1 (RFC 0018 Phase 2.A) — V-World 건축물대장 자동 fetch
-- 적용일: 2026-05-01
-- 목적: 위반건축물 자동 감지 + 사용승인일 / 주용도 / 연면적 자동 보강
-- 사장님 도메인 통찰: 아파트/오피스텔/상가/사무실만 자동 (전유부 명확)
--                      빌라/주택은 자동화 X (도면 / 실측 필수)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 위반건축물 + fetch 메타 컬럼 추가
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_violation_building BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS violation_reason TEXT,
  ADD COLUMN IF NOT EXISTS building_register_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS building_register_source TEXT
    CHECK (building_register_source IS NULL OR building_register_source IN ('vworld', 'manual', 'admin'));

COMMENT ON COLUMN listings.is_violation_building IS
  'PR-R-1: 위반건축물 여부 (V-World 건축물대장 자동 감지). admin 만 표시 (사용자 UI 부정적 표시 X).';
COMMENT ON COLUMN listings.violation_reason IS
  'PR-R-1: 위반 사유 (예: 무단증축, 무단용도변경). admin 전용.';
COMMENT ON COLUMN listings.building_register_fetched_at IS
  'PR-R-1: 마지막 V-World fetch 시각 (NULL = 미fetch).';
COMMENT ON COLUMN listings.building_register_source IS
  'PR-R-1: 데이터 출처 - vworld(자동) / manual(매물 등록 시 수동) / admin(사장님 직접 보정).';

-- cron 효율 인덱스 (미fetch 매물 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_listings_building_register_pending
  ON listings(id)
  WHERE building_register_fetched_at IS NULL
    AND status = '공개'
    AND type_normalized IN ('아파트', '오피스텔', '상가', '사무실');

-- 위반건축물 admin 패널용 (사장님 검토 큐)
CREATE INDEX IF NOT EXISTS idx_listings_violation_admin
  ON listings(building_register_fetched_at DESC)
  WHERE is_violation_building = TRUE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 헬퍼 함수: type_normalized 가 자동 보강 OK 인지
-- 사장님 도메인 통찰 영구 인코딩
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION building_register_auto_eligible(t TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT t IN ('아파트', '오피스텔', '상가', '사무실')
$$;

COMMENT ON FUNCTION building_register_auto_eligible IS
  'PR-R-1: 사장님 도메인 통찰 — 빌라/다가구/주택은 도면/실측 필수, 자동 X.';
