-- G-54 (2026-05-03): 중복 btree index DROP — 동일 컬럼 + 동일 predicate.

DROP INDEX IF EXISTS public.idx_fav_user;
DROP INDEX IF EXISTS public.idx_fav_listing;
DROP INDEX IF EXISTS public.idx_admin_users_role_status;
DROP INDEX IF EXISTS public.idx_admin_audit_log_target;
