-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-worldclass2 (2026-04-24 pm): rpc_map_clusters 격자 셀 중심 스냅
--
-- 문제:
--   기존 RPC 는 각 셀 내 listing 들의 AVG(lat), AVG(lng) 를 cluster 중심으로
--   반환.  밀집 지역(강남)에서 인접 셀의 centroid 가 모두 중앙 쪽으로 끌려와
--   시각적으로 겹치는 현상 발생.
--
-- 해결:
--   cluster 중심을 셀의 "격자 중심 좌표" 로 고정 — 인접 셀은 항상 g 만큼 떨어져
--   있어 겹치지 않는다.  카운트만 셀 안의 실제 수.  네이버/직방/다방의 그리드
--   마커도 동일 방식 (cell-anchored).
--
-- 부가 개선:
--   · 밀집 구(서울) 에 맞춰 zoom 7~10 의 격자 더 촘촘하게 조정
--   · LIMIT 1500 → 800 (과밀화 방지, 지도 1뷰에서 충분)
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
    -- 줌 17+ → 개별, 16 이하 → 그리드.
    -- L-worldclass2 (2026-04-24): 수도권 밀집에 맞춰 촘촘화.
    --   (이전값 대비 전반적으로 작은 셀로)
    SELECT
      CASE
        WHEN zoom >= 17 THEN 0.0      -- 개별
        WHEN zoom >= 15 THEN 0.0015   -- 건물 단위 (~150m)
        WHEN zoom >= 13 THEN 0.005    -- 블록 (~500m)
        WHEN zoom >= 11 THEN 0.015    -- 동 단위 (~1.5km)
        WHEN zoom >= 10 THEN 0.030    -- 동~구 사이 (~3km)
        WHEN zoom >= 9  THEN 0.050    -- 구 단위 (~5km, 이전 11km)
        WHEN zoom >= 8  THEN 0.080    -- 시 권역 (~9km)
        WHEN zoom >= 7  THEN 0.150    -- 광역시 (~17km)
        ELSE 0.300                      -- 시/도 (~33km)
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
      -- L-worldclass2: cluster 중심을 셀 중심으로 스냅 (AVG 아님).
      --   인접 셀 간 최소 거리 = g (겹침 구조적 제거).
      --   개별 매물(g=0) 은 listing 좌표 그대로.
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
    -- 셀 중심 그대로 (모두 같은 셀이면 동일 값)
    MIN(cell_lat)::float8                 AS lat,
    MIN(cell_lng)::float8                 AS lng,
    COUNT(*)::int                         AS count,
    MIN(price)::bigint                    AS min_price,
    AVG(price)::bigint                    AS avg_price,
    MAX(price)::bigint                    AS max_price,
    (ARRAY_AGG(id ORDER BY price DESC NULLS LAST))[1:3] AS sample_ids
  FROM snapped
  GROUP BY gid
  ORDER BY count DESC
  LIMIT 800
$$;

COMMENT ON FUNCTION rpc_map_clusters IS
  'L-worldclass2 (2026-04-24): 셀 중심 스냅 + 수도권 격자 촘촘화. 인접 클러스터 시각 겹침 제거.';
