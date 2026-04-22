-- ──────────────────────────────────────────────────────────────────────
-- L-mfa1 (2026-04-23): Admin TOTP MFA 2nd factor
--
-- 목적:
--   master / superadmin / admin 로그인에 TOTP 2nd factor 를 강제한다.
--   단일 factor(패스워드/JWT) 탈취만으로 prod DB 를 변이하는 경로를 차단.
--
-- 요약:
--   admin_users 테이블에 MFA 등록/사용 상태 컬럼 4개 추가
--   admin_mfa_recovery_codes 테이블 신설 (분실 대비 10개 1회용 코드)
--
-- 관련:
--   - docs/L-mfa1-admin-totp-2026-04-23.md (설계서)
--   - L-sec2 JWT 서명 검증 (2026-04-22)
--   - L-sec112 IDOR 수정 (horizontal privilege escalation 차단)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret text,                        -- AES-256-GCM 암호화된 base32 시드
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_last_used_at timestamptz;

COMMENT ON COLUMN admin_users.mfa_secret IS
  'AES-256-GCM encrypted base32 TOTP seed. Key: MFA_ENCRYPTION_KEY env. Format: iv(12):ciphertext:tag(16), base64.';

-- 분실/재설정용 1회용 코드(10개) — SHA-256 해시만 저장
CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,                                         -- sha256(normalized code) hex
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 활성(미소모) 코드만 빠르게 찾기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_admin_mfa_recovery_admin_id_active
  ON admin_mfa_recovery_codes(admin_user_id)
  WHERE consumed_at IS NULL;

-- ─── 주의 ──────────────────────────────────────────────────────────
-- 본 마이그레이션은 기존 admin 레코드에 영향이 없다(mfa_enabled 기본 false).
-- 14일 grace 이후 mfa_enabled=false admin 을 차단하는 로직은 애플리케이션 계층에서
-- /api/admin/mfa/login-verify + 프론트 배너로 처리 (쿼리 차단이 아님).
-- ──────────────────────────────────────────────────────────────────────
