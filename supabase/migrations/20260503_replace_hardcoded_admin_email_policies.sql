-- G-57 (2026-05-03): 4개 RLS 정책에서 'wishes@wishes.co.kr' 하드코드 제거.
-- is_admin_or_above() helper 로 통일.

DROP POLICY IF EXISTS info_requests_select_admin ON public.info_requests;
CREATE POLICY info_requests_select_admin ON public.info_requests
  FOR SELECT TO authenticated USING (is_admin_or_above());

DROP POLICY IF EXISTS info_requests_update_admin ON public.info_requests;
CREATE POLICY info_requests_update_admin ON public.info_requests
  FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS registry_raw_admin_all ON public.registry_raw;
CREATE POLICY registry_raw_admin_all ON public.registry_raw
  FOR ALL TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS reports_admin_all ON public.reports;
CREATE POLICY reports_admin_all ON public.reports
  FOR ALL TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());
