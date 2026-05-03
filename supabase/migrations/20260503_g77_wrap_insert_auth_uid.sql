-- G-77 (2026-05-03): INSERT 정책 6개의 auth.uid() → (SELECT auth.uid()) 래핑.
-- G-61/G-62 가 SELECT/UPDATE/DELETE 만 처리해 INSERT 가 빠진 것을 advisor 가 잡음.

DROP POLICY IF EXISTS favorites_insert_own ON public.favorites;
CREATE POLICY favorites_insert_own ON public.favorites
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS alerts_insert_own ON public.alert_settings;
CREATE POLICY alerts_insert_own ON public.alert_settings
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS push_sub_owner_insert ON public.push_subscriptions;
CREATE POLICY push_sub_owner_insert ON public.push_subscriptions
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS listings_broker_insert ON public.listings;
CREATE POLICY listings_broker_insert ON public.listings
  FOR INSERT
  WITH CHECK (is_broker_or_above() AND ((created_by IS NULL) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS short_urls_broker_insert ON public.short_urls;
CREATE POLICY short_urls_broker_insert ON public.short_urls
  FOR INSERT
  WITH CHECK (is_broker_or_above() AND ((created_by IS NULL) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS user_consents_self_insert ON public.user_consents;
CREATE POLICY user_consents_self_insert ON public.user_consents
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));
