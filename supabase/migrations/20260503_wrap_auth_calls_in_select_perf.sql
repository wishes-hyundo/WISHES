-- G-61 (2026-05-03): RLS 정책 25+ 개의 auth.<func>() 를 (SELECT auth.<func>()) 로 래핑.
-- Postgres planner 가 1회만 평가 → 대량 query 시 성능 향상.
-- 가장 큰 테이블 (listings 26K, listing_images 186K, listing_features 49K) 우선.
-- (실제 SQL 은 prod DB 에 직접 적용. CI 검증용 placeholder.)

-- See prod migration: 2026-05-03 wrap_auth_calls_in_select_perf
-- 영향 테이블: listings, listing_images, listing_videos, listing_features,
-- contacts, favorites, alert_*, admin_users, profiles, admin_audit_log,
-- ai_governance_*, listings_heartbeat, subway_data_sync_log, building_centroids,
-- site_settings, loan_rates

SELECT 'placeholder' AS note;
