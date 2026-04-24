-- ──────────────────────────────────────────────────────────────────────
-- L-sec165 (2026-04-23): admin_users.email 정규화 (lowercase + trim)
--
-- 배경:
--   adminAuth.ts 와 auth/verify/route.ts 가 admin_users 를 조회할 때
--   auth.users.email (Supabase 가 항상 lowercase 로 돌려주는 값) 을
--   그대로 .eq('email', emailLower) 로 매칭한다. 하지만 admin_users 에
--   과거 수동 insert 된 row 중 일부가 대문자 혼재(예: 'Qkrcndgy89@Naver.com')
--   로 저장되어 있으면 .eq 매칭 실패 → verify 가 role='user', status='pending'
--   반환 → 클라이언트가 agent 권한에서 강등되는 비대칭.
--
--   L-sec161 에서 .or(id.eq.X,email.eq.Y) 로 확장해 id 경로 fallback 을
--   만들었고 L-sec162 에서 email.ilike 로 case-insensitive 시도했지만,
--   ilike 는 underscore(_) 가 와일드카드로 해석되는 edge case 가 있어서
--   eq 로 복원. 근본은 DB 에 lowercase 로 저장하는 것이 정답.
--
-- 수정 내용:
--   1. 기존 row backfill: LOWER(TRIM(email)) 로 일괄 갱신
--   2. BEFORE INSERT/UPDATE 트리거: 새로 들어오거나 수정되는 email 을
--      항상 lowercase + trim 으로 저장 (애플리케이션 레벨 실수 방어)
--
-- 영향:
--   - adminAuth.ts, auth/verify/route.ts, login/route.ts 등 .eq('email', ...)
--     경로가 항상 성공적으로 매칭됨
--   - agent bounce 이슈 근본 원인 제거
--
-- 롤백:
--   트리거만 DROP 하면 됨 (backfill 은 데이터 손상 아니므로 롤백 불필요).
-- ──────────────────────────────────────────────────────────────────────

-- ① 기존 email 을 lowercase + trim 으로 일괄 normalize.
--    이미 정규화된 row 는 UPDATE 되지 않도록 WHERE 로 skip.
UPDATE admin_users
SET    email = LOWER(TRIM(email))
WHERE  email IS NOT NULL
  AND  email <> LOWER(TRIM(email));

-- ② 쓰기 시점에 자동 normalize 하는 트리거 함수.
--    NEW.email 이 NULL 이면 건드리지 않음 (NOT NULL 제약은 별도).
CREATE OR REPLACE FUNCTION normalize_admin_users_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ③ 기존 트리거가 있으면 제거하고 다시 붙이기 (idempotent)
DROP TRIGGER IF EXISTS trg_normalize_admin_users_email ON admin_users;

CREATE TRIGGER trg_normalize_admin_users_email
BEFORE INSERT OR UPDATE OF email ON admin_users
FOR EACH ROW
EXECUTE FUNCTION normalize_admin_users_email();

-- 함수/트리거 메타정보
COMMENT ON FUNCTION normalize_admin_users_email() IS
  'L-sec165: admin_users.email 자동 lowercase+trim. adminAuth .eq 매칭 비대칭 방어.';

COMMENT ON TRIGGER trg_normalize_admin_users_email ON admin_users IS
  'L-sec165 (2026-04-23): BEFORE INSERT/UPDATE OF email → LOWER(TRIM(email)).';
