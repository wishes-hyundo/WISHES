-- G-47 (2026-05-03): Supabase advisor security 권장 처리.
-- spatial_ref_sys 는 PostGIS 시스템 테이블 — owner 변경 불가, 보안상 무해.
-- 
-- 핵심: SECURITY DEFINER 함수 anon/authenticated REVOKE + search_path 명시.

REVOKE EXECUTE ON FUNCTION public.ai_run_daily_governance() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_enrichment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_dong_type_avg() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_text() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_type_avg() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_split_detection() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reports_updated_at() FROM anon, authenticated;

ALTER FUNCTION public.normalize_type(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tr_listings_normalize_type_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.tr_listings_ai_hallucination_check_fn() SET search_path = public, pg_temp;
