-- G-111 (2026-05-03 사장님): rpc_map_clusters 에 p_category 추가.
--
-- 원인: viewport API (categoryToTypeFilter) 는 residence 카테고리에서
--   cross-residential (사무실/근린/학원 area_m2 < 50㎡) 매물도 포함하지만
--   rpc_map_clusters 는 단순 type_normalized = ANY(...) 만 사용해
--   cross-residential 미포함.
--   사장님 신림동 검수에서 viewport (2,905) vs cluster (2,879) 매물수 26건 차이.
--
-- 해결: cluster RPC 에 p_category 인자 + viewport 와 동일 logic.
--   useMapClusters.ts 에서 propertyTypes 가 비어있으면 category 만 보내고
--   서버가 cross-residential 매칭 처리.
--
-- 시그니처: 기존 인자 끝에 p_category text DEFAULT NULL 추가 — backward compatible.

CREATE OR REPLACE FUNCTION public.rpc_map_clusters(
  sw_lat double precision,
  sw_lng double precision,
  ne_lat double precision,
  ne_lng double precision,
  zoom integer,
  p_deals text[] DEFAULT NULL,
  p_types text[] DEFAULT NULL,
  p_min_price bigint DEFAULT NULL,
  p_max_price bigint DEFAULT NULL,
  p_min_deposit bigint DEFAULT NULL,
  p_max_deposit bigint DEFAULT NULL,
  p_min_monthly bigint DEFAULT NULL,
  p_max_monthly bigint DEFAULT NULL,
  p_min_area double precision DEFAULT NULL,
  p_max_area double precision DEFAULT NULL,
  p_rooms integer[] DEFAULT NULL,
  p_new_years integer DEFAULT NULL,
  p_station_m integer DEFAULT NULL,
  p_features text[] DEFAULT NULL,
  p_has_images boolean DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS TABLE(
  cluster_id text,
  lat double precision,
  lng double precision,
  count integer,
  min_price bigint,
  avg_price bigint,
  max_price bigint,
  sample_ids integer[]
)
LANGUAGE sql
STABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_catalog'
AS $function$
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
      AND (p_types IS NULL OR array_length(p_types, 1) = 0 OR m.type_normalized = ANY(p_types))
      -- G-111: p_types 미지정 시 p_category 기반 cross-residential 매칭 (viewport 정렬)
      AND (
        p_types IS NOT NULL
        OR p_category IS NULL
        OR (
          p_category = 'residence' AND (
            m.type_normalized ILIKE '%원룸%' OR m.type_normalized ILIKE '%투룸%' OR m.type_normalized ILIKE '%쓰리룸%'
            OR m.type_normalized ILIKE '%아파트%' OR m.type_normalized ILIKE '%오피스텔%' OR m.type_normalized ILIKE '%빌라%'
            OR m.type_normalized ILIKE '%주택%' OR m.type_normalized ILIKE '%단독%' OR m.type_normalized ILIKE '%다가구%'
            OR m.type_normalized ILIKE '%다세대%' OR m.type_normalized ILIKE '%연립%' OR m.type_normalized ILIKE '%고시원%'
            OR m.type_normalized ILIKE '%쉐어하우스%'
            OR (m.type ILIKE '%사무실%' AND m.area_m2 < 50)
            OR (m.type ILIKE '%근린%' AND m.area_m2 < 50)
            OR (m.type ILIKE '%학원%' AND m.area_m2 < 50)
          )
        )
        OR (
          p_category = 'retail_office' AND (
            m.type_normalized ILIKE '%상가%' OR m.type_normalized ILIKE '%사무%' OR m.type_normalized ILIKE '%오피스%'
            OR m.type_normalized ILIKE '%지식산업%' OR m.type_normalized ILIKE '%공유오피스%' OR m.type_normalized ILIKE '%복합%'
            OR m.type_normalized ILIKE '%근생%'
          )
        )
        OR (
          p_category = 'land' AND (
            m.type_normalized ILIKE '%토지%' OR m.type_normalized ILIKE '%대지%'
            OR m.type_normalized = '전' OR m.type_normalized = '답'
            OR m.type_normalized ILIKE '%임야%' OR m.type_normalized ILIKE '%잡종지%'
          )
        )
        OR (
          p_category = 'investment' AND (
            m.type_normalized ILIKE '%수익%' OR m.type_normalized ILIKE '%재건축%' OR m.type_normalized ILIKE '%경매%'
          )
        )
      )
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
$function$;
