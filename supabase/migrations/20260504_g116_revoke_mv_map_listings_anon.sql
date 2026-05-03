-- G-116 (CRITICAL — 2026-05-04 사장님): mv_map_listings anon/authenticated 직접 SELECT 차단.
--   advisor materialized_view_in_api 경고 + 실측 — anon key 만으로 PostgREST 호출 시
--   호수/동/지번 (address_detail) 모두 leak.  서버 API 의 sanitizePublicListing
--   (G-81/G-83 fix) 우회되어 privacy 보호 무력화 + 직거래 유출 risk.
--
--   해결: REVOKE ALL PRIVILEGES FROM anon, authenticated.
--         서버 routes 는 service_role 키 사용하므로 영향 0.
--         로그인 사용자 정확 위치 노출 → 서버 RPC 통해 RLS 적용 후 노출.
--
--   prod 검증 (2026-05-04):
--     - anon GET mv_map_listings → HTTP 401 permission denied (차단 OK)
--     - /api/listings/viewport → 정상 응답 (service_role)
--     - /api/map/clusters → 정상 응답 (service_role)

REVOKE ALL PRIVILEGES ON public.mv_map_listings FROM anon, authenticated, PUBLIC;

-- 향후 MV refresh 시에도 anon/authenticated 권한이 자동 재부여되지 않도록 default privileges 도 정리.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
