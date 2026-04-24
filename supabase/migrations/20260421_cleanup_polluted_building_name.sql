-- ==============================================================
-- #124 : building_name 오염분 복구 스크립트
--   Date : 2026-04-21
--   Context :
--     - 크롤링 파이프라인에서 building_name 필드에 플랫폼명·슬로건·
--       URL·지번·HTML 잔여물이 섞여들어간 약 176건 박제
--     - src/lib/sanitizeBuildingName.ts 의 표시 방어선은 이미 배포 완료 (#123)
--     - 이 SQL 은 DB 원본을 "건물명 아님" 상태로 되돌리는 정화 단계
--
--   원칙 (메모리 feedback_crawled_copyright / feedback_no_crawl_source_ui)
--     · 오염 값은 NULL 로 되돌린다 (매물 자체는 지우지 않는다)
--     · 원본은 raw_fields.building_name_original 로 백업해 감사 추적 가능
--     · 표시 방어선과 패턴이 일치해야 UI/DB 가 동기화됨
--
--   적용 방법
--     Supabase SQL Editor 에서 트랜잭션으로 실행.
--     먼저 SELECT 블록으로 매칭 건수 확인 후 UPDATE 실행 권장.
-- ==============================================================

-- ────────────────────────────────────────────────────────────
-- STEP 0 : 건수 프리뷰 (UPDATE 전에 반드시 확인)
-- ────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS polluted_count
--   FROM listings
--  WHERE building_name IS NOT NULL
--    AND TRIM(building_name) <> ''
--    AND (
--      -- 크롤링 소스명
--      building_name ILIKE '%공실클럽%'
--      OR building_name ILIKE '%네모%'
--      OR building_name ILIKE '%다방%'
--      OR building_name ILIKE '%피터팬%'
--      OR building_name ILIKE '%직방%'
--      OR building_name ILIKE '%네이버부동산%'
--      OR building_name ILIKE '%온하우스%'
--      OR building_name ILIKE '%onhouse%'
--      OR building_name ILIKE '%zigbang%'
--      OR building_name ILIKE '%dabang%'
--      OR building_name ILIKE '%gongsil%'
--      -- AI 슬로건 패턴
--      OR building_name ~ '가능한\s*집'
--      OR building_name ~ '좋은\s*집'
--      OR building_name ~ '추천\s*합니다'
--      OR building_name ~ '위치\s*좋'
--      OR building_name ~ '교통\s*편리'
--      OR building_name ~ '즉시\s*입주'
--      OR building_name ~ '신축\s*급'
--      OR building_name ~ '수리\s*완료'
--      OR building_name ~ '매물\s*입니다'
--      -- URL/HTML 잔여물
--      OR building_name ~* 'https?://|www\.|\.(co\.kr|com|net|org)'
--      OR building_name ~ '<[^>]+>'
--      OR building_name ~* '&[a-z]+;|&#\d+;'
--      -- 길이 이상치
--      OR CHAR_LENGTH(TRIM(building_name)) < 2
--      OR CHAR_LENGTH(TRIM(building_name)) > 30
--      -- 한글·영문 한 글자 이상 없는 경우 (숫자/기호만)
--      OR building_name !~ '[가-힣a-zA-Z]'
--    );

-- ────────────────────────────────────────────────────────────
-- STEP 1 : raw_fields 백업 (감사 추적 가능)
--   raw_fields 가 NULL 이면 빈 객체로 초기화 후 병합
-- ────────────────────────────────────────────────────────────

BEGIN;

-- raw_fields JSONB 에 building_name_original 백업
UPDATE listings
   SET raw_fields = COALESCE(raw_fields, '{}'::jsonb)
                    || jsonb_build_object(
                         'building_name_original', building_name,
                         'building_name_cleaned_at', NOW()::text,
                         'building_name_cleaned_reason', 'sanitizeBuildingName #123/#124'
                       )
 WHERE building_name IS NOT NULL
   AND TRIM(building_name) <> ''
   AND (
     -- 크롤링 소스명
     building_name ILIKE '%공실클럽%'
     OR building_name ILIKE '%네모%'
     OR building_name ILIKE '%다방%'
     OR building_name ILIKE '%피터팬%'
     OR building_name ILIKE '%직방%'
     OR building_name ILIKE '%네이버부동산%'
     OR building_name ILIKE '%온하우스%'
     OR building_name ILIKE '%onhouse%'
     OR building_name ILIKE '%zigbang%'
     OR building_name ILIKE '%dabang%'
     OR building_name ILIKE '%gongsil%'
     -- AI 슬로건 패턴
     OR building_name ~ '가능한\s*집'
     OR building_name ~ '좋은\s*집'
     OR building_name ~ '추천\s*합니다'
     OR building_name ~ '위치\s*좋'
     OR building_name ~ '교통\s*편리'
     OR building_name ~ '즉시\s*입주'
     OR building_name ~ '신축\s*급'
     OR building_name ~ '수리\s*완료'
     OR building_name ~ '매물\s*입니다'
     -- URL/HTML 잔여물
     OR building_name ~* 'https?://|www\.|\.(co\.kr|com|net|org)'
     OR building_name ~ '<[^>]+>'
     OR building_name ~* '&[a-z]+;|&#\d+;'
     -- 길이 이상치
     OR CHAR_LENGTH(TRIM(building_name)) < 2
     OR CHAR_LENGTH(TRIM(building_name)) > 30
     -- 한글·영문 한 글자 이상 없는 경우 (숫자/기호만)
     OR building_name !~ '[가-힣a-zA-Z]'
   );

-- ────────────────────────────────────────────────────────────
-- STEP 2 : 오염 값 NULL 처리
-- ────────────────────────────────────────────────────────────

UPDATE listings
   SET building_name = NULL,
       updated_at = NOW()
 WHERE building_name IS NOT NULL
   AND TRIM(building_name) <> ''
   AND (
     building_name ILIKE '%공실클럽%'
     OR building_name ILIKE '%네모%'
     OR building_name ILIKE '%다방%'
     OR building_name ILIKE '%피터팬%'
     OR building_name ILIKE '%직방%'
     OR building_name ILIKE '%네이버부동산%'
     OR building_name ILIKE '%온하우스%'
     OR building_name ILIKE '%onhouse%'
     OR building_name ILIKE '%zigbang%'
     OR building_name ILIKE '%dabang%'
     OR building_name ILIKE '%gongsil%'
     OR building_name ~ '가능한\s*집'
     OR building_name ~ '좋은\s*집'
     OR building_name ~ '추천\s*합니다'
     OR building_name ~ '위치\s*좋'
     OR building_name ~ '교통\s*편리'
     OR building_name ~ '즉시\s*입주'
     OR building_name ~ '신축\s*급'
     OR building_name ~ '수리\s*완료'
     OR building_name ~ '매물\s*입니다'
     OR building_name ~* 'https?://|www\.|\.(co\.kr|com|net|org)'
     OR building_name ~ '<[^>]+>'
     OR building_name ~* '&[a-z]+;|&#\d+;'
     OR CHAR_LENGTH(TRIM(building_name)) < 2
     OR CHAR_LENGTH(TRIM(building_name)) > 30
     OR building_name !~ '[가-힣a-zA-Z]'
   );

COMMIT;

-- ────────────────────────────────────────────────────────────
-- STEP 3 : 검증 쿼리 (적용 후 실행해서 숫자 확인)
-- ────────────────────────────────────────────────────────────
-- 백업 복사된 건수
-- SELECT COUNT(*) AS backed_up
--   FROM listings
--  WHERE raw_fields ? 'building_name_original';
--
-- 잔존 오염분 (0 이어야 함)
-- SELECT id, building_name
--   FROM listings
--  WHERE building_name IS NOT NULL
--    AND (
--      building_name ILIKE '%공실클럽%' OR building_name ILIKE '%네모%'
--      OR building_name ILIKE '%다방%' OR building_name ILIKE '%피터팬%'
--      OR building_name ILIKE '%직방%' OR building_name ILIKE '%네이버부동산%'
--      OR building_name ~ '가능한\s*집' OR building_name ~ '좋은\s*집'
--    );
--
-- Materialized View 재빌드 (오염 건물명이 mv_map_listings 에도 박혀있을 수 있음)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_map_listings;

-- ────────────────────────────────────────────────────────────
-- 롤백 (필요 시)
-- ────────────────────────────────────────────────────────────
-- UPDATE listings
--    SET building_name = raw_fields->>'building_name_original'
--  WHERE raw_fields ? 'building_name_original'
--    AND building_name IS NULL;
