-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PR-R-2 (RFC 0018 Phase 2.A) — 공시지가 + 개별주택가격 자동 fetch
-- 적용일: 2026-05-01
-- 데이터: V-World 무료 (표준지 공시지가 + 개별주택가격)
-- 헌법 'AI 시세 추정 X' 일관:
--   - 정부 공식 평가액만 (자동 보강)
--   - admin 만 표시 / 사용자 UI 영향 0 (참고용)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS land_price_per_m2 INTEGER,
  ADD COLUMN IF NOT EXISTS land_price_year INTEGER,
  ADD COLUMN IF NOT EXISTS land_price_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS house_price_total BIGINT,
  ADD COLUMN IF NOT EXISTS house_price_year INTEGER,
  ADD COLUMN IF NOT EXISTS house_price_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN listings.land_price_per_m2 IS
  'PR-R-2: 표준지 공시지가 원/㎡ (V-World 자동, 정부 공식 평가).';
COMMENT ON COLUMN listings.land_price_year IS
  'PR-R-2: 공시 연도 (2025/2026 등).';
COMMENT ON COLUMN listings.house_price_total IS
  'PR-R-2: 개별주택가격 총액 원 (V-World 자동, 단독주택/다가구).';

-- 미fetch 매물 빠른 조회 (cron 효율)
CREATE INDEX IF NOT EXISTS idx_listings_land_price_pending
  ON listings(id)
  WHERE land_price_fetched_at IS NULL
    AND status = '공개';

CREATE INDEX IF NOT EXISTS idx_listings_house_price_pending
  ON listings(id)
  WHERE house_price_fetched_at IS NULL
    AND status = '공개'
    AND type_normalized IN ('빌라', '건물');  -- 단독/다가구 = 빌라/건물
