-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-clusterexact2 (2026-04-24 pm): rpc_map_clusters 의 sample_ids 확장
--
-- 배경:
--   기존 RPC 는 cluster 당 `sample_ids int[] = (ARRAY_AGG(id ...))[1:3]` 로
--   3개만 반환.  사용자 피드백: "4짜리 클러스터 눌렀을 때 4개가 보여야 하는데
--   일부만 표시됨".  클라이언트는 count 만큼의 id 가 필요하지만 3개만 받음.
--
-- 변경:
--   [1:3] → [1:30] 로 상한만 높임.
--   · count <= 30 (일상적 소규모 클러스터) 은 전체 id 반환 → 클라이언트가
--     정확한 N개 filter 가능
--   · count > 30 (대도시 밀집) 은 30 개만 반환 (payload 보호, 어차피 줌인해서
--     풀어야 할 규모)
--
-- payload 영향:
--   · 800 클러스터 * 평균 15 id * ~4 byte = ~48KB (기존 ~10KB → +38KB)
--   · Vercel CDN 캐시 적용되어 DB 왕복은 1/N 로 축소
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP FUNCTION IF EXISTS rpc_map_clusters;

CREATE OR REPLACE FUNCTION rpc_map_clusters(
  sw_lat  float8,
  sw_lng  float8,
  ne_lat  float8,
  ne_lng  float8,
  zoom    int,
  p_deal  text DEFAULT NULL,
  p_type  text DEFAULT NULL,
  p_min_price bigint DEFAULT NULL,
  p_max_price bigint DEFAULT NULL
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
    SELECT m.id, m.lat, m.lng, m.price_unified AS price, m.deal, m.type
    FROM mv_map_listings m
    WHERE m.lat BETWEEN sw_lat AND ne_lat
      AND m.lng BETWEEN sw_lng AND ne_lng
      AND (p_deal IS NULL OR m.deal = p_deal)
      AND (p_type IS NULL OR m.type = p_type)
      AND (p_min_price IS NULL OR m.price_unified >= p_min_price)
      AND (p_max_price IS NULL OR m.price_unified <= p_max_price)
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
    -- L-clusterexact2 (2026-04-24 pm): [1:3] -> [1:30]
    --   count <= 30 은 전체 id 반환 -> 클라이언트가 정확한 N개 필터 가능.
    (ARRAY_AGG(id ORDER BY price DESC NULLS LAST))[1:30] AS sample_ids
  FROM snapped
  GROUP BY gid
  ORDER BY count DESC
  LIMIT 800
$$;

COMMENT ON FUNCTION rpc_map_clusters IS
  'L-clusterexact2 (2026-04-24): sample_ids limit 3->30, exact cluster filter support.';

GRANT EXECUTE ON FUNCTION rpc_map_clusters TO anon, authenticated;
