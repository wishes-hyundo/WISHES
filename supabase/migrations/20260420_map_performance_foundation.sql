-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 20260420 — /map 10만 건 대응 성능 파운데이션
--
--   Phase 1-A: PostGIS GIST / BRIN / pg_trgm GIN 인덱스
--   Phase 1-B: Materialized View mv_map_listings + pg_cron 3분 리프레시
--   Phase 1-C: pgvector 확장 + embedding 컬럼 + HNSW
--   Phase 1-D: rpc_map_clusters RPC (줌 레벨별 그리드 클러스터링)
--   Phase 1-E: match_listings RPC (pgvector 자연어 검색)
--
-- 근거: 2026년 4월 최신 베스트프랙티스
--   - Supabase pgvector 0.6+ HNSW 병렬 빌드 (30배 빠름)
--   - PostGIS ST_SnapToGrid 기반 서버 클러스터링
--   - Materialized View CONCURRENTLY 리프레시 (무중단)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ==============================================================
-- Phase 1-A: 인덱스
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) 공간 GIST 인덱스 (status='공개'만 부분 인덱스 → 크기 반토막)
CREATE INDEX IF NOT EXISTS idx_listings_geom
  ON listings
  USING GIST (ST_MakePoint(lng, lat))
  WHERE status = '공개';

-- 2) 복합 B-tree (뷰포트 + 필터)
CREATE INDEX IF NOT EXISTS idx_listings_bounds_filter
  ON listings (status, lat, lng, deal, type)
  WHERE status = '공개';

-- 3) BRIN 인덱스 (시계열 — 저장공간 1/100)
CREATE INDEX IF NOT EXISTS idx_listings_created_brin
  ON listings USING BRIN (created_at);
CREATE INDEX IF NOT EXISTS idx_listings_updated_brin
  ON listings USING BRIN (updated_at);

-- 4) 한글 trigram GIN 인덱스 (오타 허용 전문 검색)
CREATE INDEX IF NOT EXISTS idx_listings_title_trgm
  ON listings USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_address_trgm
  ON listings USING GIN (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_building_trgm
  ON listings USING GIN (building_name gin_trgm_ops);

-- 5) 동 단위 조회용
CREATE INDEX IF NOT EXISTS idx_listings_dong_status
  ON listings (dong, status)
  WHERE status = '공개';


-- ==============================================================
-- Phase 1-B: Materialized View
--   지도용 경량 뷰 + 대표 썸네일 프리조인 → 조인 비용 제로화
-- ==============================================================

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
  -- 대표 썸네일 프리조인
  (SELECT url FROM listing_images
    WHERE listing_id = l.id
    ORDER BY is_thumbnail DESC NULLS LAST, sort_order ASC NULLS LAST
    LIMIT 1) AS thumb_url,
  -- 영상 보유 여부 (배지용)
  EXISTS(SELECT 1 FROM listing_videos WHERE listing_id = l.id) AS has_video,
  -- 가격 통합 (정렬·클러스터링용)
  COALESCE(l.deposit, l.monthly, l.price) AS price_unified
FROM listings l
WHERE l.status = '공개';

-- MV 전용 인덱스 (CONCURRENTLY refresh 에 필수)
CREATE UNIQUE INDEX idx_mv_map_listings_id ON mv_map_listings (id);
CREATE INDEX idx_mv_map_listings_geom ON mv_map_listings USING GIST (ST_MakePoint(lng, lat));
CREATE INDEX idx_mv_map_listings_bounds ON mv_map_listings (lat, lng);
CREATE INDEX idx_mv_map_listings_filter ON mv_map_listings (deal, type);
CREATE INDEX idx_mv_map_listings_updated ON mv_map_listings USING BRIN (updated_at);

-- pg_cron 3분 리프레시 (CONCURRENTLY = 무중단)
SELECT cron.unschedule('refresh_mv_map_listings')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_map_listings');
SELECT cron.schedule(
  'refresh_mv_map_listings',
  '*/3 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_map_listings $$
);


-- ==============================================================
-- Phase 1-C: pgvector 자연어 검색
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- BGE-small-ko / OpenAI text-embedding-3-small 호환 384차원
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS embedding vector(384);

-- HNSW 인덱스 (pgvector 0.6+ 병렬 빌드 권장)
-- m = 16, ef_construction = 64 (부동산 도메인 밸런스)
CREATE INDEX IF NOT EXISTS idx_listings_embedding_hnsw
  ON listings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 임베딩 메타데이터 (최초 생성 시각, 재생성 플래그)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_source TEXT;


-- ==============================================================
-- Phase 1-D: rpc_map_clusters — 줌 레벨별 그리드 클러스터링
-- ==============================================================

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
    -- 줌 17+ → 개별 매물, 16 이하 → 그리드 집계
    SELECT
      CASE
        WHEN zoom >= 17 THEN 0.0      -- 개별
        WHEN zoom >= 15 THEN 0.0015   -- 건물 단위 (~150m)
        WHEN zoom >= 13 THEN 0.006    -- 블록 (~600m)
        WHEN zoom >= 11 THEN 0.025    -- 동 단위 (~2.5km)
        WHEN zoom >= 9  THEN 0.1      -- 구 단위
        ELSE 0.4                        -- 시 단위
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
      id, lat, lng, price
    FROM filtered
  )
  SELECT
    gid                                   AS cluster_id,
    AVG(lat)::float8                      AS lat,
    AVG(lng)::float8                      AS lng,
    COUNT(*)::int                         AS count,
    MIN(price)::bigint                    AS min_price,
    AVG(price)::bigint                    AS avg_price,
    MAX(price)::bigint                    AS max_price,
    (ARRAY_AGG(id ORDER BY price DESC NULLS LAST))[1:3] AS sample_ids
  FROM snapped
  GROUP BY gid
  ORDER BY count DESC
  LIMIT 1500
$$;


-- ==============================================================
-- Phase 1-E: match_listings — pgvector HNSW 자연어 검색
-- ==============================================================

DROP FUNCTION IF EXISTS match_listings;

CREATE OR REPLACE FUNCTION match_listings(
  query_embedding  vector(384),
  match_threshold  float DEFAULT 0.70,
  match_count      int DEFAULT 30,
  sw_lat float8 DEFAULT NULL,
  sw_lng float8 DEFAULT NULL,
  ne_lat float8 DEFAULT NULL,
  ne_lng float8 DEFAULT NULL
) RETURNS TABLE (
  id              int,
  similarity      float,
  title           text,
  ai_title        text,
  type            text,
  deal            text,
  deposit         bigint,
  monthly         bigint,
  price           bigint,
  lat             float8,
  lng             float8,
  dong            text,
  thumb_url       text,
  area_pyeong     numeric
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    l.id,
    1 - (l.embedding <=> query_embedding) AS similarity,
    l.title,
    l.ai_title,
    l.type,
    l.deal,
    l.deposit,
    l.monthly,
    l.price,
    l.lat,
    l.lng,
    l.dong,
    (SELECT url FROM listing_images
      WHERE listing_id = l.id
      ORDER BY is_thumbnail DESC NULLS LAST, sort_order ASC NULLS LAST
      LIMIT 1) AS thumb_url,
    l.area_pyeong
  FROM listings l
  WHERE l.status = '공개'
    AND l.embedding IS NOT NULL
    AND 1 - (l.embedding <=> query_embedding) > match_threshold
    AND (sw_lat IS NULL OR l.lat BETWEEN sw_lat AND ne_lat)
    AND (sw_lng IS NULL OR l.lng BETWEEN sw_lng AND ne_lng)
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count
$$;


-- ==============================================================
-- 신규 매물 푸시용 Broadcast 헬퍼 (Phase 4-E 지원)
-- ==============================================================

-- public mirror 테이블 (RLS 없는 경량 복사본) — Realtime Broadcast 스케일 대응
CREATE TABLE IF NOT EXISTS public.listings_map_diff (
  id int PRIMARY KEY,
  lat float8,
  lng float8,
  type text,
  deal text,
  price_unified bigint,
  thumb_url text,
  title text,
  op text,                       -- 'insert' | 'update' | 'delete'
  created_at timestamptz DEFAULT now()
);

-- TRIGGER: listings INSERT/UPDATE → mirror 적재
CREATE OR REPLACE FUNCTION sync_listings_map_diff()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.listings_map_diff(id, op) VALUES (OLD.id, 'delete')
      ON CONFLICT (id) DO UPDATE SET op='delete', created_at=now();
    RETURN OLD;
  ELSIF NEW.status = '공개' THEN
    INSERT INTO public.listings_map_diff(id, lat, lng, type, deal, price_unified, title, op)
      VALUES (NEW.id, NEW.lat, NEW.lng, NEW.type, NEW.deal,
              COALESCE(NEW.deposit, NEW.monthly, NEW.price),
              COALESCE(NEW.ai_title, NEW.title),
              CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END)
      ON CONFLICT (id) DO UPDATE SET
        lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        type = EXCLUDED.type, deal = EXCLUDED.deal,
        price_unified = EXCLUDED.price_unified,
        title = EXCLUDED.title,
        op = EXCLUDED.op, created_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_map_diff ON listings;
CREATE TRIGGER trg_listings_map_diff
  AFTER INSERT OR UPDATE OR DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION sync_listings_map_diff();

-- 오래된 diff 정리 (24h)
CREATE OR REPLACE FUNCTION cleanup_listings_map_diff() RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.listings_map_diff WHERE created_at < now() - interval '24 hours';
$$;

SELECT cron.unschedule('cleanup_map_diff')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_map_diff');
SELECT cron.schedule('cleanup_map_diff', '0 4 * * *', 'SELECT cleanup_listings_map_diff()');


-- ==============================================================
-- 권한 (Supabase RLS 호환)
-- ==============================================================

-- MV 는 public read (status='공개' 만 들어있음)
GRANT SELECT ON mv_map_listings TO anon, authenticated;

-- RPC 는 public execute
GRANT EXECUTE ON FUNCTION rpc_map_clusters TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_listings TO anon, authenticated;

-- diff 테이블은 서버만 읽기 (Broadcast 서버 1곳만)
ALTER TABLE listings_map_diff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_diff_access" ON listings_map_diff;
CREATE POLICY "service_role_diff_access" ON listings_map_diff
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ==============================================================
-- 최초 리프레시 + 통계 업데이트
-- ==============================================================

REFRESH MATERIALIZED VIEW mv_map_listings;
ANALYZE listings;
ANALYZE mv_map_listings;
