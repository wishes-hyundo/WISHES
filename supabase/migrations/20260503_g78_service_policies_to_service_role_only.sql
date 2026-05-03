-- G-78 (2026-05-03): service_role ALL 정책 16개를 TO service_role 로 한정.
-- 이전: PUBLIC 에 적용 (auth.role() = 'service_role' 으로 필터) → anon/authenticated 쿼리마다 평가.
-- 이후: TO service_role 만 → 다른 role 쿼리에서 평가 회피.
-- advisor multiple_permissive_policies 98 → 5 (남은 5개는 admin_all+user_select dual purpose).

DROP POLICY IF EXISTS admin_audit_log_service_only ON public.admin_audit_log;
CREATE POLICY admin_audit_log_service_only ON public.admin_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ai_governance_log_service_role_all ON public.ai_governance_log;
CREATE POLICY ai_governance_log_service_role_all ON public.ai_governance_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ai_governance_state_service_role_all ON public.ai_governance_state;
CREATE POLICY ai_governance_state_service_role_all ON public.ai_governance_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_alerts ON public.alert_settings;
CREATE POLICY service_alerts ON public.alert_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service write building_centroids" ON public.building_centroids;
CREATE POLICY "service write building_centroids" ON public.building_centroids
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS contacts_service_role_all ON public.contacts;
CREATE POLICY contacts_service_role_all ON public.contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_favorites ON public.favorites;
CREATE POLICY service_favorites ON public.favorites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS listing_features_service_role_all ON public.listing_features;
CREATE POLICY listing_features_service_role_all ON public.listing_features
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS listing_images_service_role_all ON public.listing_images;
CREATE POLICY listing_images_service_role_all ON public.listing_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS listing_videos_service_role_all ON public.listing_videos;
CREATE POLICY listing_videos_service_role_all ON public.listing_videos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS listings_service_role_all ON public.listings;
CREATE POLICY listings_service_role_all ON public.listings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS listings_heartbeat_service_role_all ON public.listings_heartbeat;
CREATE POLICY listings_heartbeat_service_role_all ON public.listings_heartbeat
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS loan_rates_service_role_all ON public.loan_rates;
CREATE POLICY loan_rates_service_role_all ON public.loan_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_profiles ON public.profiles;
CREATE POLICY service_profiles ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS site_settings_service_role_all ON public.site_settings;
CREATE POLICY site_settings_service_role_all ON public.site_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS subway_data_sync_log_service_role_all ON public.subway_data_sync_log;
CREATE POLICY subway_data_sync_log_service_role_all ON public.subway_data_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
