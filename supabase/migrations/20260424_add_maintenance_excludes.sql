-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-maint-exc (2026-04-24 pm): listings.maintenance_excludes TEXT[]
--
-- 관리비 상세 UI (매물 모달) 에서 '전기 별도 / 가스 별도 / 수도 별도' 같은
-- '제외' 항목을 표시하려면 기존 maintenance_includes (포함) 컬럼 옆에 대칭되는
-- excludes 컬럼이 필요.  지금까지는 컬럼 부재로 빨간색 '별도' chip 렌더
-- 불가능했다.
--
-- 크롤링 매물은 ai_description / description 에서 '전기/가스/수도/인터넷/TV'
-- 같은 키워드 주변 '별도'·'본인부담'·'미포함' 어휘로 백필.  별도 backfill
-- 스크립트 (api/admin/backfill-maintenance) 에서 일회성 UPDATE.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS maintenance_excludes TEXT[];

COMMENT ON COLUMN listings.maintenance_excludes IS
  '관리비 제외 항목 (예: [전기, 가스, 수도, 인터넷, TV]). 사용자가 본인 부담하는 항목.';

-- MV 즉시 갱신 — mv_map_listings 는 컬럼 재선택 필요.  다음 cron refresh 에서 자동 반영.
--   (이 컬럼은 목록/지도 응답 페이로드에 들어가지 않으므로 MV 에 추가 안 함.
--    상세 응답만 PUBLIC_LISTING_COLUMNS 에 있으면 됨.)
