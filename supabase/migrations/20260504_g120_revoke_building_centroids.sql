-- G-120 (CRITICAL — 2026-05-04 사장님): building_centroids anon dump 차단.
--   advisor 미발견 leak — 11,486 단지명+정확좌표 PostgREST 직접 노출.
--   직거래 reverse-lookup 가능 (cluster_token + dong + 좌표 → 정확 단지 식별).
--   서버 API (HtmlMarkerOverlay tier1_lat/lng 응답) 는 service_role 사용.
--
--   prod 검증: anon GET → HTTP 401 permission denied. /api/listings/viewport 정상.

REVOKE ALL PRIVILEGES ON public.building_centroids FROM anon, authenticated, PUBLIC;
