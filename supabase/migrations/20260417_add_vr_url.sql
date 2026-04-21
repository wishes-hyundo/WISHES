-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T2-5: 매물 상세 VR · 360° 투어 뷰어
-- listings 테이블에 vr_url TEXT 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 지원 프로바이더:
--   Matterport, Kuula, Roundme, Klapty, YouTube 360°, 기타 임베드 가능한 URL
-- 사용:
--   - 자체 매물(source_site IS NULL) 에만 상세 페이지에 뷰어 노출
--   - 크롤링 매물은 URL 이 있어도 미노출 (품질·저작권 보호)
-- 입력 UI:
--   /admin/listings/[id]/edit → Step 3 (매물 설명) 하단 "VR·360° 투어 URL" 필드
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS vr_url TEXT;

-- 코멘트(도움말)
COMMENT ON COLUMN listings.vr_url IS
  'VR · 360° 투어 임베드 URL (Matterport/Kuula/Roundme/Klapty/YouTube 360° 등). 비어있으면 상세 페이지에 뷰어 미노출.';

-- 선택: 검색 성능을 위해 NULL 이 아닌 매물만 인덱스 (대부분 NULL 이므로 partial index)
CREATE INDEX IF NOT EXISTS idx_listings_vr_url_not_null
  ON listings (id)
  WHERE vr_url IS NOT NULL;
