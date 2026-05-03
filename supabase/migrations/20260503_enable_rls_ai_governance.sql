-- G-46 (2026-05-03): ai_governance_log/state 테이블 RLS 미활성화 → anon 가시.
-- AI 호출 비용/한도 정보 노출. ENABLE RLS + admin/service only.

ALTER TABLE public.ai_governance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_governance_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_governance_log_admin_select
  ON public.ai_governance_log
  FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY ai_governance_log_service_role_all
  ON public.ai_governance_log
  FOR ALL
  TO public
  USING (auth.role() = 'service_role');

CREATE POLICY ai_governance_state_admin_select
  ON public.ai_governance_state
  FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY ai_governance_state_service_role_all
  ON public.ai_governance_state
  FOR ALL
  TO public
  USING (auth.role() = 'service_role');
