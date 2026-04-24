-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-search9 (2026-04-24): rpc_admin_listings_minimal 단일 쿼리 함수
--
-- 목적:
--   /api/admin/listings?fields=minimal 가 현재 sequential pagination 7회
--   (PAGE_SIZE 1000 × 6204행) + listing_images IN 쿼리 1회 로 cold 시 5s.
--   RPC 하나로 통합해 cold 1.5s 수준으로 단축.
--
-- 동작:
--   · WHERE 조건: p_scope_uid 지정시 created_by 필터 (admin 'scope=mine')
--   · 결과: listings 전체 + first_image_url (sort_order 최소 1장)
--   · ORDER BY created_at DESC
--
-- 호출자:
--   src/app/api/admin/listings/route.ts  (L-search9 분기 — 우선 RPC 시도,
--   없거나 에러면 기존 sequential 경로로 fallback)
--
-- 보안:
--   · SECURITY DEFINER 사용 안 함 — caller 권한 그대로 (service_role 경로만 호출)
--   · REVOKE 후 service_role 만 EXECUTE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 0) 전제 인덱스 (listing_images 의 lateral subquery 가속)
--    이미 있으면 no-op
CREATE INDEX IF NOT EXISTS idx_listing_images_lid_sort
  ON listing_images (listing_id, sort_order);

-- 1) 함수 정의
DROP FUNCTION IF EXISTS public.rpc_admin_listings_minimal(uuid, int);

CREATE OR REPLACE FUNCTION public.rpc_admin_listings_minimal(
  p_scope_uid uuid DEFAULT NULL,
  p_limit     int  DEFAULT 10000
)
RETURNS TABLE (
  id               bigint,
  title            text,
  type             text,
  deal             text,
  status           text,
  deposit          numeric,
  monthly          numeric,
  price            numeric,
  maintenance_fee  numeric,
  maintenance_includes text,
  area_m2          numeric,
  area_supply_m2   numeric,
  floor_current    text,
  floor_total      text,
  rooms            int,
  bathrooms        int,
  direction        text,
  address          text,
  address_detail   text,
  dong             text,
  building_name    text,
  lat              double precision,
  lng              double precision,
  available_date   date,
  built_year       text,
  parking          boolean,
  elevator         boolean,
  pet              boolean,
  balcony          boolean,
  full_option      boolean,
  loan_available   boolean,
  business_type    text,
  goodwill_fee     numeric,
  station_name     text,
  station_distance text,
  created_at       timestamptz,
  created_by       uuid,
  last_verified_at timestamptz,
  source_site      text,
  updated_at       timestamptz,
  first_image_url  text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.id, l.title, l.type, l.deal, l.status,
    l.deposit, l.monthly, l.price,
    l.maintenance_fee, l.maintenance_includes,
    l.area_m2, l.area_supply_m2,
    l.floor_current, l.floor_total,
    l.rooms, l.bathrooms, l.direction,
    l.address, l.address_detail, l.dong,
    l.building_name,
    l.lat, l.lng,
    l.available_date, l.built_year,
    l.parking, l.elevator, l.pet, l.balcony,
    l.full_option, l.loan_available,
    l.business_type, l.goodwill_fee,
    l.station_name, l.station_distance,
    l.created_at, l.created_by,
    l.last_verified_at, l.source_site,
    l.updated_at,
    (
      SELECT url
      FROM listing_images li
      WHERE li.listing_id = l.id
      ORDER BY li.sort_order ASC NULLS LAST
      LIMIT 1
    ) AS first_image_url
  FROM listings l
  WHERE p_scope_uid IS NULL OR l.created_by = p_scope_uid
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;

-- 2) 권한: service_role 만 호출 가능
REVOKE EXECUTE ON FUNCTION public.rpc_admin_listings_minimal(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_admin_listings_minimal(uuid, int) TO service_role;

-- 3) 문서화
COMMENT ON FUNCTION public.rpc_admin_listings_minimal(uuid, int) IS
  'L-search9 / /api/admin/listings?fields=minimal 용 단일 쿼리 함수. sequential pagination 제거. service_role 전용.';
