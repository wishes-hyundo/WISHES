-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 마이그레이션: 상업용 업종 정보 + 크롤링 출처 필드 추가
-- 날짜: 2026-04-10
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 상업용 업종 정보 (공실클럽 등 크롤링 데이터)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS previous_business TEXT;        -- 이전업종
ALTER TABLE listings ADD COLUMN IF NOT EXISTS recommended_business TEXT;     -- 추천업종
ALTER TABLE listings ADD COLUMN IF NOT EXISTS restricted_business TEXT;      -- 금지업종
ALTER TABLE listings ADD COLUMN IF NOT EXISTS parking_spaces INTEGER;        -- 주차대수 (주차 가능 대수)

-- 크롤링 출처 정보
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_site TEXT;              -- 출처 사이트 (onhouse, gongsilclub 등)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_id TEXT;               -- 출처 사이트 내 매물 ID
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_url TEXT;              -- 출처 URL
ALTER TABLE listings ADD COLUMN IF NOT EXISTS building_name TEXT;           -- 건물명 (이미 존재할 경우 무시됨)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact TEXT;                 -- 담당자 연락처
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lease_period TEXT;            -- 임대기간
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rights_fee INTEGER;           -- 권리금 (만원)

-- 인덱스: 출처 사이트로 중복 체크용
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source_site, source_id);
