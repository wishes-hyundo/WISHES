-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-detail-schema (2026-04-24)
--
-- /listings/[id] 상세 카드 v2 에서 노출할 필드 추가:
--   room_layout        — 방구조 (분리형/일체형/복층) — 원룸 시세 +5~10% 영향
--   is_duplex          — 복층 여부 (bool)
--   illegal_building   — 위반 건축물 여부 (bool; 네이버 벤치마크)
--   last_verified_at   — 최근 현장확인 시각 (허위매물 4단 검증용)
--   total_parking_spaces — 건물 전체 주차대수 (기존 parking_spaces 는 세대용으로 해석 혼재)
--
-- 모든 컬럼 NULLABLE. 기존 매물 영향 X.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

-- 방구조 enum 대신 TEXT + CHECK constraint (alter 용이성)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS room_layout TEXT
    CHECK (room_layout IS NULL OR room_layout IN ('분리형', '일체형', '복층'));

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_duplex BOOLEAN DEFAULT FALSE;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS illegal_building BOOLEAN DEFAULT FALSE;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS total_parking_spaces INTEGER;

-- 자주 필터링되는 컬럼이라 인덱스 (원룸 분리형/복층 선호 사용자 쿼리)
CREATE INDEX IF NOT EXISTS idx_listings_room_layout
  ON listings (room_layout)
  WHERE room_layout IS NOT NULL;

COMMIT;
