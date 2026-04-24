-- ──────────────────────────────────────────────────────────────────────
-- L-sec167 (2026-04-23): admin_users 테이블 최초 생성 + 기존 사용자 백필
--
-- 발견 경위:
--   Supabase SQL Editor 에서 SELECT table_name ... WHERE table_name ILIKE '%admin%'
--   실행 결과: admin_audit_log 만 존재, admin_users 는 부재.
--
-- 현재 영향 (migration 적용 전):
--   - 모든 admin API (verifyAdminAuth) 가 admin_users lookup 실패 → false → 401
--   - adminFetch 가 401 받으면 sessionStorage clear + 로그인 페이지 redirect
--   - 결과: wishes@wishes.co.kr (SUPERADMIN_EMAILS 하드코딩) 외 모든
--     사용자가 /admin/ 진입 직후 튕김 = 'agent bounce' 증상의 근본 원인.
--
-- 관련 기존 migration:
--   - 20260423_add_admin_mfa.sql: admin_users 에 MFA 컬럼 4개 ALTER (테이블 부재라 실행 시 에러)
--   - 20260423_rls_phase1_shadow.sql: admin_users 대상 RLS 정책 (테이블 부재라 실행 시 에러)
--   - 20260423_normalize_admin_users_email.sql (L-sec165): email 정규화 (테이블 부재라 실행 시 에러)
--
--   본 migration (L-sec167) 을 가장 먼저 실행해야 함.
-- ──────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════
-- ① 테이블 생성
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_users (
  -- auth.users.id 와 동일한 uuid. FK 로 묶어 auth 삭제 시 자동 정리.
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- email 은 항상 lowercase+trim (트리거로 강제, 하단).
  email text NOT NULL UNIQUE,

  -- 표시용 필드 (Command Center, admin_users 리스트용).
  name text,
  company text,

  -- 권한 레벨. adminAuth.ts 의 ADMIN_ROLES 와 동기.
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('superadmin', 'admin', 'agent', 'user')),

  -- 승인 상태. Command Center 의 승인/차단/거절 버튼이 이 필드를 갱신.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),

  -- MFA (L-mfa1, 2026-04-23 기존 migration 호환)
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret text,
  mfa_enrolled_at timestamptz,
  mfa_last_used_at timestamptz,

  -- 타임스탬프
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 빠른 lookup 용 인덱스 (email 은 UNIQUE 로 자동 생성됨)
CREATE INDEX IF NOT EXISTS idx_admin_users_role_status
  ON admin_users(role, status);

-- 테이블/컬럼 설명
COMMENT ON TABLE admin_users IS
  'L-sec167: admin/agent 권한 관리 테이블. Supabase auth.users 와 1:1 매칭 (id FK).';

COMMENT ON COLUMN admin_users.role IS
  'superadmin: 최상위 / admin: 일반 관리자 / agent: 중개사 / user: 승인 전 or 권한 없음';

COMMENT ON COLUMN admin_users.status IS
  'pending: 승인 대기 / approved: 활성 / rejected: 가입 거절 / blocked: 이용 정지';

-- ════════════════════════════════════════
-- ② email 정규화 트리거 (L-sec165 로직 통합)
-- ════════════════════════════════════════

CREATE OR REPLACE FUNCTION normalize_admin_users_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;
  -- updated_at 자동 갱신
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_admin_users_email ON admin_users;

CREATE TRIGGER trg_normalize_admin_users_email
BEFORE INSERT OR UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION normalize_admin_users_email();

-- ════════════════════════════════════════
-- ③ 기존 auth.users 에서 백필 (가입된 사용자들 pending 상태로)
-- ════════════════════════════════════════
--
-- auth.users 에 이미 가입한 사용자들 (박충효님 포함) 을 admin_users 에
-- 시드. 기본값은 role='user', status='pending' 로 '승인 대기' 상태.
-- Command Center 에서 슈퍼어드민이 하나씩 agent/admin 으로 승격 필요.
--
-- 단, 하드코딩 SUPERADMIN_EMAILS (현재 wishes@wishes.co.kr) 는 즉시
-- superadmin + approved 로 올려서 관리 진입 가능하게 함.

INSERT INTO admin_users (id, email, name, company, role, status)
SELECT
  u.id,
  LOWER(TRIM(u.email))            AS email,
  COALESCE(u.raw_user_meta_data->>'name', '')    AS name,
  COALESCE(u.raw_user_meta_data->>'company', '') AS company,
  CASE
    WHEN LOWER(TRIM(u.email)) = 'wishes@wishes.co.kr' THEN 'superadmin'
    ELSE 'user'
  END AS role,
  CASE
    WHEN LOWER(TRIM(u.email)) = 'wishes@wishes.co.kr' THEN 'approved'
    ELSE 'pending'
  END AS status
FROM   auth.users u
WHERE  u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;  -- idempotent — 여러 번 실행해도 안전

-- ════════════════════════════════════════
-- ④ RLS (Row Level Security) — 최소 정책
-- ════════════════════════════════════════
--
-- 클라이언트(anon key) 가 admin_users 를 직접 SELECT 하면 모든 사용자의
-- email/role 이 노출됨. RLS 로 본인 row 만 읽을 수 있게 제한.
-- service_role (서버 supabase 클라이언트) 는 RLS 우회하므로 기존 코드에
-- 영향 없음.

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 본인 row 만 SELECT (클라이언트 사이드 프로필 조회용)
DROP POLICY IF EXISTS "admin_users_self_select" ON admin_users;
CREATE POLICY "admin_users_self_select"
  ON admin_users
  FOR SELECT
  USING (id = auth.uid());

-- 쓰기는 service_role (서버) 만 허용. 클라이언트 직접 수정 차단.
-- (service_role 은 RLS 를 우회하므로 별도 policy 불필요)
