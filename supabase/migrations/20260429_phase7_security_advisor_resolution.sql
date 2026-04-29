-- ============================================================
-- PHASE 7 — Supabase Security Advisor Resolution
-- 2026-04-29 (UTC)
-- 적용처: Supabase MCP 로 production 에 직접 apply 완료
--   - phase7_security_advisor_part1_rls_2026_04_29
--   - phase7_security_advisor_part2_function_search_path_2026_04_29
--   - phase7_security_advisor_part3_secdef_lockdown_2026_04_29
-- 본 파일은 git 추적용 스냅샷이며 재실행해도 idempotent.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART 1 — RLS 활성화 (ERROR 등급 해결)
--   listings_heartbeat / subway_data_sync_log 는 cron(service_role)
--   전용 테이블이므로 anon/authenticated 권한 회수 후 RLS ON.
--   spatial_ref_sys 는 PostGIS 시스템 테이블 (supabase_admin 소유)
--   이라 ALTER 불가 — 알려진 false-positive 로 둔다.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.listings_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listings_heartbeat FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS listings_heartbeat_service_role_all ON public.listings_heartbeat;
CREATE POLICY listings_heartbeat_service_role_all
  ON public.listings_heartbeat
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.subway_data_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subway_data_sync_log FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS subway_data_sync_log_service_role_all ON public.subway_data_sync_log;
CREATE POLICY subway_data_sync_log_service_role_all
  ON public.subway_data_sync_log
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- PART 2 — function search_path 고정 (WARN 17건 해결)
-- ──────────────────────────────────────────────────────────────

ALTER FUNCTION public.calc_listing_fingerprint(text, real, text, text, integer, integer, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fill_listing_image_source_at()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fill_listing_video_source_at()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.find_nearest_exits(double precision, double precision, integer, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.find_nearest_stations(double precision, double precision, integer, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_archive_old_sold(integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_bump_miss_count(text, text, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_listings_heartbeat()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_listings_price_history()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_listings_sold_at()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_listings_touch()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_notify_new_listing()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_record_heartbeat()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_sunset_listings(integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.match_listings(vector, double precision, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.normalize_listing_address(text, text, text, text, text)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.trg_normalize_listing_address()
  SET search_path = public, pg_catalog;

-- ──────────────────────────────────────────────────────────────
-- PART 3 — SECURITY DEFINER 노출면 축소
--   • 트리거 전용 함수 → anon/authenticated EXECUTE 회수 (트리거에서는 자동 실행)
--   • 사용자 RPC 함수 → SECURITY INVOKER 전환 (테이블에 이미 public RLS 정책 존재)
-- ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.log_listing_change()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_listing_photo_count()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_listing_wishes_media_status()
  FROM anon, authenticated, PUBLIC;

ALTER FUNCTION public.find_nearest_stations(double precision, double precision, integer, integer)
  SECURITY INVOKER;
ALTER FUNCTION public.find_nearest_exits(double precision, double precision, integer, integer)
  SECURITY INVOKER;
ALTER FUNCTION public.count_area_same()
  SECURITY INVOKER;

-- ============================================================
-- 잔존 advisor 항목 (코드 레벨로 해결 불가)
-- ============================================================
-- 1) spatial_ref_sys RLS — PostGIS 시스템 테이블 (supabase_admin 소유)
-- 2) postgis / pg_trgm / vector extension in public — 이전은 위험
-- 3) st_estimatedextent SECURITY DEFINER — PostGIS C 함수 (owner-locked)
-- 4) auth_leaked_password_protection — Supabase Auth 대시보드에서 토글
--    → Project Settings → Auth → Password Protection 토글 ON
