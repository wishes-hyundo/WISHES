-- ──────────────────────────────────────────────────────────────────────
-- Phase 0 RLS Tightening (2026-04-27)
--
-- 목표: 기존 RLS Phase 1 (shadow policies) 에서 벗어나 실제 접근 제한 구현
--
-- 현재 상태 (Phase 1):
--   - 모든 테이블에 ENABLE ROW LEVEL SECURITY
--   - USING(true), WITH CHECK(true) 로 shadow policy 설정
--   - service_role 은 RLS 우회, anon/authenticated 는 모두 허용
--
-- Phase 0 목표:
--   - listings: broker_id=auth.uid() 또는 명시적 공개 매물만
--   - contacts: owner_id=auth.uid() 또는 assigned_agent
--   - appointments: attendee_id=auth.uid() 또는 created_by=auth.uid()
--   - admin_users: 본인 프로필만 (기존 policy 유지)
--   - broker_accounts: 타 중개사 접근 차단
--   - rate limiting 을 위한 audit 테이블 추가
--
-- 마이그레이션 실행 순서:
--   1. 신규 helper function 추가
--   2. Shadow policy 교체 (tighter policy)
--   3. listings_api_calls 테이블 생성 (rate limiting 용)
--   4. 롤백 절차 문서화
-- ──────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- 1. Helper Functions
-- ════════════════════════════════════════════════════════════════════════

-- 1.1 현재 사용자가 broker 테이블에 등록되어 있는가?
CREATE OR REPLACE FUNCTION is_authenticated_broker() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1
      FROM broker_accounts
      WHERE user_id = auth.uid()
        AND status IN ('active', 'pending_verification')
        AND disabled = false
    );
  $$;

COMMENT ON FUNCTION is_authenticated_broker() IS
  'Returns true if auth.uid() is a registered broker (not yet admin). Used by listings RLS policy.';

-- 1.2 현재 사용자가 특정 listing 의 소유자(브로커)인가?
CREATE OR REPLACE FUNCTION is_listing_owner(listing_broker_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT listing_broker_id = auth.uid()
       OR EXISTS (
         SELECT 1
         FROM broker_accounts
         WHERE user_id = auth.uid()
           AND organization_id = (
             SELECT organization_id
             FROM broker_accounts
             WHERE user_id = listing_broker_id
           )
           AND role IN ('admin', 'manager')
       );
  $$;

COMMENT ON FUNCTION is_listing_owner(uuid) IS
  'Checks if auth.uid() owns a listing or is a manager/admin of the same organization.';

-- ════════════════════════════════════════════════════════════════════════
-- 2. Rate Limiting Audit Table
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listings_api_calls (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  called_at timestamptz NOT NULL DEFAULT now(),

  -- Rate limiting 검사용 인덱스
  CONSTRAINT user_endpoint_time
    UNIQUE (user_id, endpoint, EXTRACT(HOUR FROM called_at))
);

CREATE INDEX IF NOT EXISTS idx_api_calls_user_hour
  ON listings_api_calls(user_id, EXTRACT(HOUR FROM called_at));

CREATE INDEX IF NOT EXISTS idx_api_calls_called_at
  ON listings_api_calls(called_at DESC);

COMMENT ON TABLE listings_api_calls IS
  'Tracks API calls per user per endpoint per hour for rate limiting. Automatically pruned after 30 days.';

-- Auto-cleanup: 30일 이상 된 레코드 삭제
CREATE OR REPLACE FUNCTION cleanup_old_api_calls()
RETURNS TABLE(deleted_count integer) AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM listings_api_calls
  WHERE called_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════
-- 3. RLS Policy Tightening
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 3.1 listings table
-- ──────────────────────────────────────────────────────────────────────
--
-- 접근 허용:
--   1. service_role: 항상 (RLS bypass)
--   2. Broker (authenticated): 본인 매물 + 공개 매물
--   3. Anonymous: 공개 매물만

DROP POLICY IF EXISTS listings_shadow_all ON listings;

-- SELECT: 본인 매물 또는 공개 매물
CREATE POLICY listings_authenticated_select ON listings
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_listing_owner(created_by)
    OR publicly_visible = true
  );

CREATE POLICY listings_anon_select ON listings
  FOR SELECT
  TO anon
  USING (publicly_visible = true);

-- INSERT: 본인 소속 조직의 broker_id 로만
CREATE POLICY listings_authenticated_insert ON listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM broker_accounts
      WHERE user_id = auth.uid()
        AND status IN ('active', 'pending_verification')
        AND disabled = false
    )
  );

-- UPDATE: 본인 매물만
CREATE POLICY listings_authenticated_update ON listings
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_listing_owner(created_by)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR is_listing_owner(created_by)
  );

-- DELETE: 본인 매물만
CREATE POLICY listings_authenticated_delete ON listings
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_listing_owner(created_by)
  );

-- ──────────────────────────────────────────────────────────────────────
-- 3.2 contacts table
-- ──────────────────────────────────────────────────────────────────────
--
-- 접근:
--   1. 본인이 생성한 contact (owner_id)
--   2. 할당받은 agent (assigned_to_agent_id)

DROP POLICY IF EXISTS contacts_shadow_all ON contacts;

CREATE POLICY contacts_authenticated_select ON contacts
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR assigned_to_agent_id = auth.uid()
  );

CREATE POLICY contacts_authenticated_insert ON contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY contacts_authenticated_update ON contacts
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR assigned_to_agent_id = auth.uid()
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR assigned_to_agent_id = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 3.3 appointments table
-- ──────────────────────────────────────────────────────────────────────
--
-- 접근:
--   1. 본인이 생성한 appointment (created_by)
--   2. 참석자 (attendees 배열 포함 여부 확인)

DROP POLICY IF EXISTS appointments_shadow_all ON appointments;

CREATE POLICY appointments_authenticated_select ON appointments
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR attendees @> to_jsonb(auth.uid())
  );

CREATE POLICY appointments_authenticated_insert ON appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY appointments_authenticated_update ON appointments
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR attendees @> to_jsonb(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 3.4 admin_users table (기존 정책 유지)
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS admin_users_shadow_all ON admin_users;

CREATE POLICY admin_users_self_select ON admin_users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Write access controlled server-side (service_role only)

-- ──────────────────────────────────────────────────────────────────────
-- 3.5 broker_accounts table (신규)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE broker_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_accounts_shadow_all ON broker_accounts;

CREATE POLICY broker_accounts_self_select ON broker_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Managers/admins can see other brokers in their org
CREATE POLICY broker_accounts_org_select ON broker_accounts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      role IN ('manager', 'admin')
      AND organization_id = (
        SELECT organization_id
        FROM broker_accounts
        WHERE user_id = auth.uid()
      )
    )
  );

-- Only service_role can INSERT/UPDATE/DELETE
-- (no client-side policy for write safety)

-- ════════════════════════════════════════════════════════════════════════
-- 4. Rollback Instructions
-- ════════════════════════════════════════════════════════════════════════
--
-- IF Phase 0 tightening breaks production, rollback by:
--
--   1. Drop the new policies:
--      DROP POLICY IF EXISTS listings_authenticated_select ON listings;
--      DROP POLICY IF EXISTS listings_anon_select ON listings;
--      DROP POLICY IF EXISTS listings_authenticated_insert ON listings;
--      DROP POLICY IF EXISTS listings_authenticated_update ON listings;
--      DROP POLICY IF EXISTS listings_authenticated_delete ON listings;
--      -- (repeat for other tables)
--
--   2. Re-apply shadow policies:
--      CREATE POLICY listings_shadow_all ON listings
--        FOR ALL
--        TO anon, authenticated
--        USING (true)
--        WITH CHECK (true);
--      -- (repeat for other tables)
--
--   3. Confirm with: SELECT * FROM pg_policies WHERE tablename = 'listings';
--
-- ════════════════════════════════════════════════════════════════════════
