-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- contacts.source 컬럼 추가 (#37)
--   목적: InquiryModal 유입 경로(홈 히어로/리스팅/매물상세/지도/스티키CTA 등)를
--          별도 컬럼으로 집계 가능하게 저장 → 어드민 리드 소스 분석 카드 기반
--
-- 기존에는 /api/contacts 에 전달된 source가 message 본문 "[유입] /listings" 로만
-- 포함돼 집계가 불가능했음. 이 마이그레이션으로 정식 컬럼화.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source TEXT;

-- 집계 성능 향상 (대량 데이터 시)
CREATE INDEX IF NOT EXISTS idx_contacts_source
  ON contacts(source)
  WHERE source IS NOT NULL;

COMMENT ON COLUMN contacts.source IS '리드 유입 경로(예: /, /listings, /listings/123, /map, /contact). InquiryModal 에서 전송.';
