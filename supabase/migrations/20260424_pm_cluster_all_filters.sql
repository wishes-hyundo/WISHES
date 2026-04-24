-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-filtercluster1 (2026-04-24 pm): rpc_map_clusters 에 전체 필터 전파
--
-- 사용자 피드백: "필터 설정해서 검색하면 필터에 맞는 매물이 표기되고 지도에도
--   필터에 맞는 것만 노출이 되야 하는데 전부 다 노출되는 문제".
--
-- 원인: 기존 RPC 는 deal/type/price 만 받고 rooms/area/features/purposes/
--   newBuildYears/hasImages/monthly/deposit 등은 무시.  클러스터 count 가
--   필터 무관한 전체 매물 기준으로 계산됨.
--
-- 수정: viewport API 와 동일한 필터 셋을 RPC 에도 전파.
--   · status = '공개' (기본)
--   · deal (IN array)
--   · type (IN array)
--   · price_unified, deposit, monthly 범위
--   · area_m2 범위
--   · rooms (IN array, 또는 >=3)
--   · built_year (recent N years)
--   · station_distance (<=meters)
--   · features (array overlap)
--   · has_images (thumb_url NOT NULL)
--
-- 추가로 sample_ids 는 L-clusterexact2 의 [1:30] 상한 유지.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP FUNCTION IF EXISTS rpc_map_clusters;

CREATE OR REPLACE FUNCTION rpc_map_clusters(
  sw_lat  float8,
  sw_lng  float8,
  ne_lat  float8,
  ne_lng  float8,
  zoom    int,
  p_deals        text[]   DEFAULT NULL,
  p_types        text[]   DEFAULT NULL,
  p_min_price    bigint   DEFAULT NULL,
  p_max_price    bigint   DEFAULT NULL,
  p_min_deposit  bigint   DEFAULT NULL,
  p_max_deposit  bigint   DEFAULT NULL,
  p_min_monthly  bigint   DEFAULT NULL,
  p_max_monthly  bigint   DEFAULT NULL,
  p_min_area     float8   DEFAULT NULL,
  p_max_area     float8   DEFAULT NULL,
  p_rooms        int[]    DEFAULT NULL,
  p_new_years    int      DEFAULT NULL,
  p_station_m    int      DEFAULT NULL,
  p_features     text[]   DEFAULT NULL,
  p_has_images   boolean  DEFAULT NULL
) RETURNS TABLE (
  cluster_id text,
  lat        float8,
  lng        float8,
  count      int,
  min_price  bigint,
  avg_price  bigint,
  max_price  bigint,
  sample_ids int[]
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH cfg AS (
    SELECT
      CASE
        WHEN zoom >= 17 THEN 0.0
        WHEN zoom >= 15 THEN 0.0015
        WHEN zoom >= 13 THEN 0.005
        WHEN zoom >= 11 THEN 0.015
        WHEN zoom >= 10 THEN 0.030
        WHEN zoom >= 9  THEN 0.050
        WHEN zoom >= 8  THEN 0.080
        WHEN zoom >= 7  THEN 0.150
        ELSE 0.300
      END AS g
  ),
  filtered AS (
    SELECT m.id, m.lat, m.lng, m.price_unified AS price
    FROM mv_map_listings m
    WHERE m.lat BETWEEN sw_lat AND ne_lat
      AND m.lng BETWEEN sw_lng AND ne_lng
      AND m.status = '공개'
      AND (p_deals IS NULL OR array_length(p_deals, 1) = 0 OR m.deal = ANY(p_deals))
      AND (p_types IS NULL OR array_length(p_types, 1) = 0 OR m.type = ANY(p_types))
      AND (p_min_price IS NULL OR m.price IS NULL OR m.price >= p_min_price)
      AND (p_max_price IS NULL OR m.price IS NULL OR m.price <= p_max_price)
      AND (p_min_deposit IS NULL OR m.deposit IS NULL OR m.deposit >= p_min_deposit)
      AND (p_max_deposit IS NULL OR m.deposit IS NULL OR m.deposit <= p_max_deposit)
      AND (p_min_monthly IS NULL OR m.monthly IS NULL OR m.monthly >= p_min_monthly)
      AND (p_max_monthly IS NULL OR m.monthly IS NULL OR m.monthly <= p_max_monthly)
      AND (p_min_area IS NULL OR m.area_m2 IS NULL OR m.area_m2 >= p_min_area)
      AND (p_max_area IS NULL OR m.area_m2 IS NULL OR m.area_m2 <= p_max_area)
      AND (p_rooms IS NULL OR array_length(p_rooms, 1) = 0 OR m.rooms = ANY(p_rooms))
      AND (p_new_years IS NULL OR m.built_year IS NULL
           OR (m.built_year ~ '^[0-9]{4}$'
               AND (m.built_year::int) >= (EXTRACT(YEAR FROM NOW())::int - p_new_years)))
      AND (p_station_m IS NULL OR m.station_distance IS NULL OR m.station_distance <= p_station_m)
      AND (p_features IS NULL OR array_length(p_features, 1) = 0
           OR (m.features IS NOT NULL AND m.features ?| p_features))
      AND (p_has_images IS NULL OR p_has_images = false OR m.thumb_url IS NOT NULL)
  ),
  snapped AS (
    SELECT
      CASE
        WHEN (SELECT g FROM cfg) = 0 THEN 'i_' || id::text
        ELSE 'c_' ||
             FLOOR(lat / (SELECT g FROM cfg))::text || '_' ||
             FLOOR(lng / (SELECT g FROM cfg))::text
      END AS gid,
      CASE
        WHEN (SELECT g FROM cfg) = 0 THEN lat
        ELSE (FLOOR(lat / (SELECT g FROM cfg)) + 0.5) * (SELECT g FROM cfg)
      END AS cell_lat,
      CASE
        WHEN (SELECT g FROM cfg) = 0 THEN lng
        ELSE (FLOOR(lng / (SELECT g FROM cfg)) + 0.5) * (SELECT g FROM cfg)
      END AS cell_lng,
      id, price
    FROM filtered
  )
  SELECT
    gid                                   AS cluster_id,
    MIN(cell_lat)::float8                 AS lat,
    MIN(cell_lng)::float8                 AS lng,
    COUNT(*)::int                         AS count,
    MIN(price)::bigint                    AS min_price,
    AVG(price)::bigint                    AS avg_price,
    MAX(price)::bigint                    AS max_price,
    (ARRAY_AGG(id ORDER BY price DESC NULLS LAST))[1:30] AS sample_ids
  FROM snapped
  GROUP BY gid
  ORDER BY count DESC
  LIMIT 800
$$;

COMMENT ON FUNCTION rpc_map_clusters IS
  'L-filtercluster1 (2026-04-24): full filter set (deals/types/area/rooms/features/etc).';

GRANT EXECUTE ON FUNCTION rpc_map_clusters TO anon, authenticated;
