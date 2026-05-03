-- G-58 (2026-05-03): push_subscriptions 중복 정책 정리.
DROP POLICY IF EXISTS push_sub_owner_select ON public.push_subscriptions;
DROP POLICY IF EXISTS push_sub_owner_delete ON public.push_subscriptions;
