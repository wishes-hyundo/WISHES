-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2026-04-21 (OPTIONAL, 스케일 대응용) : H3 클러스터 Materialized View
--
-- 이 마이그레이션은 기본 구성이 아니다.  매물 수가 10만+ 되어 live GROUP BY 가
-- 50 ms 초과하기 시작할 때 선택적으로 적용한다. 적용 후에는 /api/listings/map 의
-- listings_clusters RPC 대신 이 MV 를 참조하는 별도 RPC 를 사용하도록 분기.
--
-- 📌 구조
--   listings_cluster_r6  : 시/도 수준 집계 (Seoul 전체 ≈ 20 행)
--   listings_cluster_r8  : 구/군 수준 집계 (강남 전체 ≈ 100 행)
--   listings_cluster_r10 : 동/블록 수준 집계 (시/군 전체 ≈ 1,000 행)
--
-- 📌 갱신 전략
--   옵션 A :  pg_cron (Supabase 제공) — 5 분 간격 REFRESH MATERIALIZED VIEW CONCURRENTLY
--   옵션 B :  Vercel Cron → /api/cron/refresh-clusters (Authorization 검증 후 SQL 호출)
--            → Free 플랜에서도 동일 동작, 트랜잭션 격리 필요 없음
--
-- 📌 CONCURRENTLY 사용 시 UNIQUE 인덱스 필수 (아래에서 생성)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─ R6 (시/도) ────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS listings_cluster_r6 CASCADE;
CREATE MATERIALIZED VIEW listings_cluster_r6 AS
SELECT
  l.h3_r6                         AS h3_cell,
  COUNT(*)                        AS listing_count,
  MIN(COALESCE(l.price, l.deposit, 0))::BIGINT AS min_price,
  BOOL_OR(l.source_site IS NULL AND EXISTS (
    SELECT 1 FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
  )) AS has_photo,
  AVG(l.lat)::DOUBLE PRECISION    AS center_lat,
  AVG(l.lng)::DOUBLE PRECISION    AS center_lng,
  -- 바운드 검색용: 셀에 속한 매물들의 경계 (GiST 인덱스 적중)
  ST_Extent(l.geom)::geometry     AS bbox
FROM listings l
WHERE l.status = '공개'
  AND l.h3_r6 IS NOT NULL
  AND l.geom IS NOT NULL
GROUP BY l.h3_r6;

CREATE UNIQUE INDEX idx_mvcluster_r6_pk ON listings_cluster_r6 (h3_cell);


-- ─ R8 (구/군) ────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS listings_cluster_r8 CASCADE;
CREATE MATERIALIZED VIEW listings_cluster_r8 AS
SELECT
  l.h3_r8                         AS h3_cell,
  COUNT(*)                        AS listing_count,
  MIN(COALESCE(l.price, l.deposit, 0))::BIGINT AS min_price,
  BOOL_OR(l.source_site IS NULL AND EXISTS (
    SELECT 1 FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
  )) AS has_photo,
  AVG(l.lat)::DOUBLE PRECISION    AS center_lat,
  AVG(l.lng)::DOUBLE PRECISION    AS center_lng,
  ST_Extent(l.geom)::geometry     AS bbox
FROM listings l
WHERE l.status = '공개'
  AND l.h3_r8 IS NOT NULL
  AND l.geom IS NOT NULL
GROUP BY l.h3_r8;

CREATE UNIQUE INDEX idx_mvcluster_r8_pk ON listings_cluster_r8 (h3_cell);


-- ─ R10 (동/블록) ──────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS listings_cluster_r10 CASCADE;
CREATE MATERIALIZED VIEW listings_cluster_r10 AS
SELECT
  l.h3_r10                        AS h3_cell,
  COUNT(*)                        AS listing_count,
  MIN(COALESCE(l.price, l.deposit, 0))::BIGINT AS min_price,
  BOOL_OR(l.source_site IS NULL AND EXISTS (
    SELECT 1 FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
  )) AS has_photo,
  AVG(l.lat)::DOUBLE PRECISION    AS center_lat,
  AVG(l.lng)::DOUBLE PRECISION    AS center_lng,
  ST_Extent(l.geom)::geometry     AS bbox
FROM listings l
WHERE l.status = '공개'
  AND l.h3_r10 IS NOT NULL
  AND l.geom IS NOT NULL
GROUP BY l.h3_r10;

CREATE UNIQUE INDEX idx_mvcluster_r10_pk ON listings_cluster_r10 (h3_cell);


-- ─ 통합 REFRESH 함수 (CONCURRENTLY) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_listings_clusters()
RETURNS TABLE (view_name TEXT, refreshed_at TIMESTAMPTZ) AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY listings_cluster_r6;
  REFRESH MATERIALIZED VIEW CONCURRENTLY listings_cluster_r8;
  REFRESH MATERIALIZED VIEW CONCURRENTLY listings_cluster_r10;

  RETURN QUERY VALUES
    ('listings_cluster_r6'::TEXT, NOW()),
    ('listings_cluster_r8'::TEXT, NOW()),
    ('listings_cluster_r10'::TEXT, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_listings_clusters IS
  'H3 클러스터 MV 3개를 CONCURRENTLY 로 재계산. pg_cron 또는 Vercel Cron 에서 5분 간격 호출.';


-- ─ 옵션 A: pg_cron 등록 (Supabase 지원 시) ───────────────────────────────
-- Supabase Dashboard → Database → Extensions 에서 pg_cron 활성화 후 실행:
--
--   SELECT cron.schedule(
--     'refresh-listings-clusters',
--     '*/5 * * * *',                        -- 5분마다
--     $$SELECT refresh_listings_clusters()$$
--   );
--
-- 제거:
--   SELECT cron.unschedule('refresh-listings-clusters');


-- ─ 옵션 B: Vercel Cron 에서 호출할 RPC 래퍼 ─────────────────────────────
-- /api/cron/refresh-clusters/route.ts 에서 이 함수를 호출:
--   const { data, error } = await supabase.rpc('refresh_listings_clusters');


-- ─ 검증 쿼리 ─────────────────────────────────────────────────────────────
--   SELECT * FROM listings_cluster_r6 ORDER BY listing_count DESC LIMIT 10;
--   SELECT refresh_listings_clusters();
