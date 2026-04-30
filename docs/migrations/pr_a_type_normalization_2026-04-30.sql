-- ════════════════════════════════════════════════════════════════════
-- PR-A — type 컬럼 정규화 + SSOT registry v0.1
-- RFC: docs/RFC/0002-pr-a-type-normalization.md
-- 작성: 2026-04-30
-- 적용: Supabase MCP execute_sql 또는 psql
-- 의존: PR-E (#10), PR-FIX (#11), PR-G2-AREA (#12) 머지 완료
--
-- 핵심 결단 (사장님 2026-04-30):
--   * type_normalized 10 종 enum (기존 8 + 토지/건물 신규 2)
--   * 확인필요 77 + 전체 36 = 113 건 → NULL + admin 큐 (status='공개' 유지)
--   * 영업 손실 방지: 일반 사용자 검색 노출 X, 직접링크/이메일 정상 동작
--   * expand-contract: type 원본 컬럼 보존 (contract 단계는 PR-A2 별도)
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- §1. 신규 컬럼 추가 (expand 단계)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS type_normalized text;

-- CHECK 제약: 10 종 enum 또는 NULL (admin 큐 전용)
ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_type_normalized_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_type_normalized_check
  CHECK (
    type_normalized IS NULL OR type_normalized IN (
      '원룸', '투룸', '쓰리룸',
      '아파트', '오피스텔', '빌라',
      '상가', '사무실',
      '토지', '건물'
    )
  );

COMMENT ON COLUMN listings.type_normalized IS
  'PR-A SSOT 정규화 type. 10 종 enum (원룸/투룸/쓰리룸/아파트/오피스텔/빌라/상가/사무실/토지/건물) 또는 NULL(admin 큐). raw type 컬럼은 expand-contract 의 contract 단계까지 dual-write 보존.';

-- ─────────────────────────────────────────────────────────────────────
-- §2. 정규화 SQL 함수 (raw type → normalized)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_type(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  trimmed := trim(raw);

  -- §2.1 정상 8 종 passthrough
  IF trimmed IN ('원룸','투룸','쓰리룸','아파트','오피스텔','빌라','상가','사무실') THEN
    RETURN trimmed;
  END IF;

  -- §2.2 신규 2 종 (사장님 결단 2026-04-30)
  IF trimmed IN ('토지','건물') THEN
    RETURN trimmed;
  END IF;

  -- §2.3 사장님 명시 매핑
  -- 원룸 계열 (사장님 룰: 오픈형/분리형/주방분리형/복층형 → 원룸)
  IF trimmed IN ('오픈형원룸','분리형원룸','주방분리형원룸','복층형원룸')
     OR trimmed LIKE '분리형원룸%'
     OR trimmed LIKE '오픈형원룸%'
     OR trimmed LIKE '복층형원룸%'
  THEN
    RETURN '원룸';
  END IF;

  -- 아파트 계열 (사장님 룰: 주거용 → 아파트)
  IF trimmed = '주거용' OR trimmed LIKE '주거용%' THEN
    RETURN '아파트';
  END IF;

  -- 빌라 계열 (사장님 룰: 주택 → 빌라)
  IF trimmed = '주택' THEN
    RETURN '빌라';
  END IF;

  -- §2.4 ★ NULL + admin 큐 (사장님 결단)
  -- ★ 반드시 사무실 wildcard 보다 앞 — '전체, 사업자등록가능' 같은 변형이 사무실로 잘못 매핑되는 버그 방지 (2026-04-30 fix)
  IF trimmed IN ('확인필요','전체') OR trimmed LIKE '전체%' THEN
    RETURN NULL;
  END IF;

  -- 사무실 계열 (사장님 룰: 지식산업센터/주택겸/사업자등록가능/사무용 → 사무실)
  IF trimmed IN ('사업자등록가능','지식산업센터','사무용','주택겸 사무실','사무실/상가') THEN
    RETURN '사무실';
  END IF;
  IF trimmed LIKE '사무용%'
     OR trimmed LIKE '주택겸%'
     OR trimmed LIKE '%사업자등록가능%'
  THEN
    RETURN '사무실';
  END IF;

  -- 상가 계열 (Claude 제안: 이면도로/대로변 → 상가)
  IF trimmed IN ('이면도로','대로변') THEN
    RETURN '상가';
  END IF;

  -- §2.5 미지의 신규 type — NULL 처리 후 admin 큐로 (안전 fallback)
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION normalize_type(text) IS
  'PR-A SSOT 정규화 함수. raw listings.type → 10 종 enum 또는 NULL. RFC 0002 §3.2 매핑 표 기준.';

-- ─────────────────────────────────────────────────────────────────────
-- §3. BEFORE INSERT/UPDATE trigger (dual-write)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION tr_listings_normalize_type_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT 또는 UPDATE 시 type 들어오면 type_normalized 자동 채움
  -- type_normalized 가 명시적으로 들어오면 우선 (admin 수동 분류 보호)
  IF (TG_OP = 'INSERT' AND NEW.type_normalized IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW.type IS DISTINCT FROM OLD.type AND NEW.type_normalized IS NOT DISTINCT FROM OLD.type_normalized)
  THEN
    NEW.type_normalized := normalize_type(NEW.type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_listings_normalize_type ON listings;
CREATE TRIGGER tr_listings_normalize_type
  BEFORE INSERT OR UPDATE OF type, type_normalized ON listings
  FOR EACH ROW
  EXECUTE FUNCTION tr_listings_normalize_type_fn();

COMMENT ON TRIGGER tr_listings_normalize_type ON listings IS
  'PR-A dual-write. INSERT 또는 type 변경 시 type_normalized 자동 채움. admin 수동 분류 (type_normalized 직접 입력) 는 보호.';

-- ─────────────────────────────────────────────────────────────────────
-- §4. 백필 UPDATE (chunked, 락 최소화)
-- ─────────────────────────────────────────────────────────────────────

-- §4.1 한 번에 1K 행씩 백필 (라이브 부하 분산)
DO $$
DECLARE
  affected int;
  total int := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM listings
      WHERE type_normalized IS NULL
        AND type IS NOT NULL
        AND type NOT IN ('확인필요','전체')
        AND type NOT LIKE '전체%'
      LIMIT 1000
      FOR UPDATE SKIP LOCKED
    )
    UPDATE listings l
    SET type_normalized = normalize_type(l.type)
    FROM batch b
    WHERE l.id = b.id;

    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    EXIT WHEN affected = 0;

    -- 짧은 양보 (라이브 트래픽 보호)
    PERFORM pg_sleep(0.05);
  END LOOP;
  RAISE NOTICE 'PR-A 백필 완료: % 매물 type_normalized 채움', total;
END $$;

-- §4.2 검증: 정상적으로 매핑되어야 할 매물 중 NULL 없음
DO $$
DECLARE
  unmapped int;
BEGIN
  SELECT count(*) INTO unmapped
  FROM listings
  WHERE type_normalized IS NULL
    AND type IS NOT NULL
    AND type NOT IN ('확인필요','전체')
    AND type NOT LIKE '전체%';

  IF unmapped > 0 THEN
    RAISE WARNING 'PR-A 검증 실패: 매핑 누락 % 건. 매핑 함수 normalize_type() 점검 필요.', unmapped;
  ELSE
    RAISE NOTICE 'PR-A 검증 통과: 매핑 누락 0 건';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- §5. 인덱스 (PR-F 전 임시, MV 갱신은 PR-F 에서)
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_listings_gu_type_normalized
  ON listings (gu, type_normalized)
  WHERE status = '공개';

CREATE INDEX IF NOT EXISTS idx_listings_type_normalized_status
  ON listings (type_normalized, status)
  WHERE type_normalized IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- §6. mv_map_listings 재정의 (type_normalized 컬럼 + gu 컬럼 추가)
-- ─────────────────────────────────────────────────────────────────────
-- PR-F 일부 흡수 — type_normalized 정합성 위해 필수 (rpc_map_clusters 의존)

DROP MATERIALIZED VIEW IF EXISTS mv_map_listings CASCADE;

CREATE MATERIALIZED VIEW mv_map_listings AS
SELECT id,
    title, ai_title, ai_description, building_name,
    type, type_normalized,  -- PR-A 신규
    deal, deposit, monthly, price,
    area_m2, area_pyeong,
    rooms, bathrooms, floor_current, floor_total,
    lat, lng, status,
    dong, gu,  -- PR-F 일부 흡수 (자치구 인덱스)
    address, address_detail,
    maintenance_fee, business_type, source_site,
    created_at, updated_at, views,
    parking, elevator, full_option, pet, balcony,
    built_year, direction,
    station_name, station_distance, features,
    (SELECT listing_images.url
       FROM listing_images
      WHERE listing_images.listing_id = l.id
      ORDER BY listing_images.is_thumbnail DESC NULLS LAST, listing_images.sort_order
      LIMIT 1) AS thumb_url,
    (EXISTS (SELECT 1 FROM listing_videos WHERE listing_videos.listing_id = l.id)) AS has_video,
    COALESCE(deposit, monthly, price) AS price_unified
FROM listings l
WHERE status = ANY (ARRAY['공개'::text, '계약중'::text])
  AND lat IS NOT NULL AND lng IS NOT NULL;

CREATE UNIQUE INDEX idx_mv_map_listings_id     ON mv_map_listings USING btree (id);
CREATE INDEX        idx_mv_map_listings_bounds ON mv_map_listings USING btree (lat, lng);
CREATE INDEX        idx_mv_map_listings_filter ON mv_map_listings USING btree (deal, type_normalized);
CREATE INDEX        idx_mv_map_listings_updated ON mv_map_listings USING brin (updated_at);
CREATE INDEX        idx_mv_map_listings_gu_type ON mv_map_listings USING btree (gu, type_normalized);

REFRESH MATERIALIZED VIEW mv_map_listings;

-- ─────────────────────────────────────────────────────────────────────
-- §7. RPC 함수 갱신 — rpc_map_clusters 의 m.type → m.type_normalized
-- ─────────────────────────────────────────────────────────────────────
-- 함수 시그니처 동일 (클라이언트 무중단). 본문 type 컬럼 비교만 type_normalized 로 변경.

CREATE OR REPLACE FUNCTION public.rpc_map_clusters(
  sw_lat double precision, sw_lng double precision,
  ne_lat double precision, ne_lng double precision,
  zoom integer,
  p_deals text[] DEFAULT NULL::text[],
  p_types text[] DEFAULT NULL::text[],
  p_min_price bigint DEFAULT NULL::bigint, p_max_price bigint DEFAULT NULL::bigint,
  p_min_deposit bigint DEFAULT NULL::bigint, p_max_deposit bigint DEFAULT NULL::bigint,
  p_min_monthly bigint DEFAULT NULL::bigint, p_max_monthly bigint DEFAULT NULL::bigint,
  p_min_area double precision DEFAULT NULL::double precision, p_max_area double precision DEFAULT NULL::double precision,
  p_rooms integer[] DEFAULT NULL::integer[],
  p_new_years integer DEFAULT NULL::integer,
  p_station_m integer DEFAULT NULL::integer,
  p_features text[] DEFAULT NULL::text[],
  p_has_images boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
  cluster_id text, lat double precision, lng double precision,
  count integer, min_price bigint, avg_price bigint, max_price bigint,
  sample_ids integer[]
)
LANGUAGE sql STABLE PARALLEL SAFE
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
      -- PR-A: m.type → m.type_normalized (SSOT v0.1)
      AND (p_types IS NULL OR array_length(p_types, 1) = 0 OR m.type_normalized = ANY(p_types))
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
      CASE WHEN (SELECT g FROM cfg) = 0 THEN 'i_' || id::text
           ELSE 'c_' || FLOOR(lat / (SELECT g FROM cfg))::text || '_' ||
                       FLOOR(lng / (SELECT g FROM cfg))::text END AS gid,
      CASE WHEN (SELECT g FROM cfg) = 0 THEN lat
           ELSE (FLOOR(lat / (SELECT g FROM cfg)) + 0.5) * (SELECT g FROM cfg) END AS cell_lat,
      CASE WHEN (SELECT g FROM cfg) = 0 THEN lng
           ELSE (FLOOR(lng / (SELECT g FROM cfg)) + 0.5) * (SELECT g FROM cfg) END AS cell_lng,
      id, price
    FROM filtered
  )
  SELECT
    gid AS cluster_id,
    MIN(cell_lat)::float8 AS lat, MIN(cell_lng)::float8 AS lng,
    COUNT(*)::int AS count,
    MIN(price)::bigint AS min_price, AVG(price)::bigint AS avg_price, MAX(price)::bigint AS max_price,
    (ARRAY_AGG(id ORDER BY price DESC NULLS LAST))[1:30] AS sample_ids
  FROM snapped
  GROUP BY gid
  ORDER BY count DESC
  LIMIT 800
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- §7. 검증 쿼리 (사장님 머지 전 확인용)
-- ─────────────────────────────────────────────────────────────────────

-- §7.1 정규화 분포 — 11 행 (10 enum + NULL) 만 보여야 정상
-- SELECT type_normalized, count(*) FROM listings WHERE status='공개' GROUP BY 1 ORDER BY 2 DESC NULLS LAST;

-- §7.2 NULL 113 건 = 확인필요 77 + 전체 34 + 전체 변형 2
-- SELECT type, count(*) FROM listings WHERE type_normalized IS NULL GROUP BY 1 ORDER BY 2 DESC;

-- §7.3 사용자 시나리오: "원룸" 검색 결과 매물 수 회복
-- SELECT count(*) FROM listings
--   WHERE type_normalized = '원룸' AND status='공개';
-- 기대: 9587 (원래) + 551 (오픈형/분리형/복층형) = 약 10,138

-- §7.4 신혼부부 시나리오: 강남 아파트 전세 매물 수 회복
-- SELECT count(*) FROM listings
--   WHERE type_normalized = '아파트' AND deal='전세' AND gu='강남구' AND status='공개';
-- 기대: 기존 + 주거용 102 매물 일부 흡수

-- ─────────────────────────────────────────────────────────────────────
-- §8. ROLLBACK (긴급 — type_normalized 사용 중단 시)
-- ─────────────────────────────────────────────────────────────────────

-- DROP TRIGGER IF EXISTS tr_listings_normalize_type ON listings;
-- DROP FUNCTION IF EXISTS tr_listings_normalize_type_fn();
-- DROP FUNCTION IF EXISTS normalize_type(text);
-- DROP INDEX IF EXISTS idx_listings_gu_type_normalized;
-- DROP INDEX IF EXISTS idx_listings_type_normalized_status;
-- ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_type_normalized_check;
-- ALTER TABLE listings DROP COLUMN IF EXISTS type_normalized;
--
-- → 원본 type 컬럼은 손대지 않았으므로 영향 0.
