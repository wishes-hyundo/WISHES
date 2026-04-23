-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-status1 (2026-04-23)
-- /map 에서 /search 대비 매물이 현저히 적게 보이던 버그의 근본 수정.
--
-- 배경:
--   /search 관리자 뷰는 status 필터 없이 전체 노출.
--   /map 은 mv_map_listings 를 읽는데 정의가 "WHERE status = '공개'" 로 제한.
--   API 라우트의 zod 기본값이 '가용' 이었는데 UI 는 '공개'/'비공개'/'계약중'/'계약완료' 만
--   사용 → API 경로(벌크 업로드, 크롤러, auto-generate)로 들어온 매물은
--   대부분 status='가용' 으로 insert 되어 MV 필터에 걸려 /map 에 안 뜸.
--
-- 수정:
--   1) 기존 '가용' row 를 '공개' 로 backfill (UI 와 통일).
--   2) mv_map_listings 정의의 WHERE 절을 '공개' + '계약중' 두 status 로 확장
--      (매물 포털 특성상 계약 진행 중도 조회는 공개).  '비공개'·'계약완료' 만 제외.
--   3) CONCURRENTLY refresh (무중단).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1) 기존 '가용' → '공개' backfill
UPDATE listings SET status = '공개' WHERE status = '가용';

-- 2) MV 재정의 (status 필터 확장)
DROP MATERIALIZED VIEW IF EXISTS mv_map_listings CASCADE;

CREATE MATERIALIZED VIEW mv_map_listings AS
SELECT
  l.id,
  l.title,
  l.ai_title,
  l.ai_description,
  l.building_name,
  l.type,
  l.deal,
  l.deposit,
  l.monthly,
  l.price,
  l.area_m2,
  l.area_pyeong,
  l.rooms,
  l.bathrooms,
  l.floor_current,
  l.floor_total,
  l.lat,
  l.lng,
  l.status,
  l.dong,
  l.address,
  l.address_detail,
  l.maintenance_fee,
  l.business_type,
  l.source_site,
  l.created_at,
  l.updated_at,
  l.views,
  l.parking,
  l.elevator,
  l.full_option,
  l.pet,
  l.balcony,
  l.built_year,
  l.direction,
  l.station_name,
  l.station_distance,
  l.features,
  (SELECT url FROM listing_images
    WHERE listing_id = l.id
    ORDER BY is_thumbnail DESC NULLS LAST, sort_order ASC NULLS LAST
    LIMIT 1) AS thumb_url,
  EXISTS(SELECT 1 FROM listing_videos WHERE listing_id = l.id) AS has_video,
  COALESCE(l.deposit, l.monthly, l.price) AS price_unified
FROM listings l
-- L-status1: '공개' + '계약중' 포함.  '비공개'·'계약완료' 만 제외.
WHERE l.status IN ('공개', '계약중')
  AND l.lat IS NOT NULL
  AND l.lng IS NOT NULL;

-- 인덱스 재생성 (CONCURRENTLY refresh 에 UNIQUE 필수)
CREATE UNIQUE INDEX idx_mv_map_listings_id ON mv_map_listings (id);
CREATE INDEX idx_mv_map_listings_bounds ON mv_map_listings (lat, lng);
CREATE INDEX idx_mv_map_listings_filter ON mv_map_listings (deal, type);
CREATE INDEX idx_mv_map_listings_updated ON mv_map_listings USING BRIN (updated_at);

-- pg_cron 재스케줄 (기존 job 은 DROP CASCADE 로 정리됨)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh_mv_map_listings')
    FROM cron.job WHERE jobname = 'refresh_mv_map_listings';
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'refresh_mv_map_listings',
  '*/3 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_map_listings $$
);

-- 권한 재부여
GRANT SELECT ON mv_map_listings TO anon, authenticated;

-- 즉시 1회 refresh
REFRESH MATERIALIZED VIEW mv_map_listings;
ANALYZE mv_map_listings;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- '가용' 상태 영구 박멸 — DB 레벨 방어
-- 사용자 피드백: "저 가용은 처음부터 속썩이네 영원히 안보이게 제거해라"
--
-- CHECK constraint 로 INSERT/UPDATE 시 '가용' 값 자체를 거부한다.
-- 이렇게 하면 이후 어떤 경로로든 (API·크롤러·직접 SQL·psql) '가용' 이
-- 들어오려 하면 DB 가 즉시 reject → '/map 에서 안 보임' 버그 재발 원천 차단.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_no_legacy_가용;
ALTER TABLE listings ADD CONSTRAINT listings_status_no_legacy_가용
  CHECK (status IS NULL OR status <> '가용');

-- 진단용 diagnostic (migration 로그에 남김)
DO $$
DECLARE
  total_listings INT;
  mv_count INT;
  hidden_status INT;
BEGIN
  SELECT COUNT(*) INTO total_listings FROM listings;
  SELECT COUNT(*) INTO mv_count FROM mv_map_listings;
  SELECT COUNT(*) INTO hidden_status FROM listings
    WHERE status NOT IN ('공개', '계약중') OR lat IS NULL OR lng IS NULL;
  RAISE NOTICE 'L-status1 migration: listings=%, mv=%, hidden(status/coords)=%',
    total_listings, mv_count, hidden_status;
END$$;
