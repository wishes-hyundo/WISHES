-- ──────────────────────────────────────────────────────────────────────
-- L-rls1 Phase 1 (2026-04-23): RLS shadow — zero behavior change.
--
-- 목표: 4개 핵심 테이블(listings/admin_users/contacts/appointments)에 RLS 를
-- ENABLE 하되, 현재 앱 동작이 바뀌지 않도록 permissive policy 로 뒷받침한다.
-- Phase 2 (admin authenticated 전환) 와 Phase 3 (공개 anon 전환) 에서
-- 본 permissive policy 를 단계적으로 좁혀 실제 접근 제한을 부여한다.
--
-- 현재 앱:
--   - 모든 DB 접근이 SUPABASE_SERVICE_ROLE_KEY 로 이뤄진다.
--   - service_role 은 RLS 를 'bypass' 하는 Supabase 기본 속성을 가짐.
--   - 즉 ENABLE ROW LEVEL SECURITY 만으로는 아무 것도 깨지지 않는다.
--   - 다만 앱 코드가 앞으로 createAuthClient()/anon 으로 이행할 수 있도록
--     anon+authenticated 에도 'USING (true)' 한시 정책을 깔아 호환성 보장.
--
-- Phase 2~4 에서 제거/대체 예정인 'shadow' policy 는 이름에 _shadow 접미사.
--
-- 관련:
--   - docs/L-rls1-supabase-rls-2026-04-23.md (설계서 phase 0/1)
--   - L-sec112 IDOR (horizontal escalation)
--   - L-sec136 IDOR (contacts/appointments)
-- ──────────────────────────────────────────────────────────────────────

-- 1) Admin role 판정용 helper. policy 에서 반복 호출되므로 STABLE.
--    SECURITY DEFINER 로 policy-recursion (admin_users 자체에 RLS) 회피.
CREATE OR REPLACE FUNCTION is_admin_unlimited() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1
      FROM admin_users
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('master', 'superadmin', 'crawler_bridge')
    );
  $$;

COMMENT ON FUNCTION is_admin_unlimited() IS
  'Returns true if the caller (auth.uid) is an approved master/superadmin/crawler_bridge admin. Used by RLS policies across listings/contacts/appointments.';

-- ── listings ─────────────────────────────────────────────────────────
-- service_role 은 bypass, anon/authenticated 는 Phase 2 에서 좁힐 때까지 allow-all
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listings_shadow_all ON listings;
CREATE POLICY listings_shadow_all ON listings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── admin_users ──────────────────────────────────────────────────────
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_shadow_all ON admin_users;
CREATE POLICY admin_users_shadow_all ON admin_users
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── contacts ────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_shadow_all ON contacts;
CREATE POLICY contacts_shadow_all ON contacts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── appointments ────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_shadow_all ON appointments;
CREATE POLICY appointments_shadow_all ON appointments
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 롤백 절차 (emergency, runbook):
--
--   ALTER TABLE listings       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE admin_users    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE contacts       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE appointments   DISABLE ROW LEVEL SECURITY;
--
-- service_role 사용 중엔 동작상 영향 없음. Phase 2 에서 본 shadow policy 를
-- tighter policy (is_admin_unlimited / created_by=auth.uid 기반) 로 교체한다.
-- ─────────────────────────────────────────────────────────────────────
