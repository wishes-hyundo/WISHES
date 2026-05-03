-- G-75 (2026-05-03): internal cron-only SECURITY DEFINER 함수의 anon/authenticated/PUBLIC EXECUTE 회수.
-- advisor 경고 0028/0029 처리. cron job 은 service_role 로 호출하므로 service_role 의 EXECUTE 만 유지.

REVOKE EXECUTE ON FUNCTION public.ai_run_daily_governance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_dong_type_avg() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_text() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_from_type_avg() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_area_split_detection() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_enrichment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reports_updated_at() FROM PUBLIC, anon, authenticated;
