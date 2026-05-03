-- G-38 (2026-05-03): on_auth_user_created 트리거가 모든 auth.users 신규 생성 시
-- public.profiles 에 row 자동 INSERT → /signup (직원/운영자) 경로에서도 profiles 생성
-- → I-AUTH-1 (profiles = 고객만) 위반.
--
-- /api/auth/register 와 /api/auth/google|kakao|naver/callback 가 이미 명시적으로
-- 올바른 테이블 (admin_users 또는 profiles) 에 INSERT 하므로 트리거는 불필요.
--
-- 비파괴: 트리거만 제거. 함수는 유지 (legacy migration 호환).

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

COMMENT ON FUNCTION public.handle_new_user() IS 'DEPRECATED 2026-05-03 (G-38): I-AUTH-1 위반 (모든 auth.users 에 profiles 자동 생성). 트리거 제거됨. /api/auth/register + OAuth callback 가 분기 처리.';
