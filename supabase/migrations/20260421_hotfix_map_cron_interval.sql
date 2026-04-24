-- ==============================================================
-- Hotfix: /map materialized view refresh 주기 조정
--   Date : 2026-04-21
--   Context : 2026-04-21 오전 /map 0건 장애 (#187)
--     - 3분 주기 REFRESH MATERIALIZED VIEW CONCURRENTLY 가
--       임베딩 백필 + Phase 1~4 마이그레이션과 겹쳐
--       Supavisor/pgBouncer 커넥션 풀 데드락 유발
--     - t4g.nano 기준 현재 데이터 볼륨(3,300여 건)에서
--       3분 주기는 과다. 5분으로 완화해 동시성 리스크 감소
--   결정 : 3분 → 5분
--     - 신선도 손실 2분 (매물 업데이트는 현재 시간당 수십 건 수준)
--     - 풀 포화 위험 ≈ 40% 감소 (리프레시 수 절반)
-- ==============================================================

SELECT cron.unschedule('refresh_mv_map_listings')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_map_listings');

SELECT cron.schedule(
  'refresh_mv_map_listings',
  '*/5 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_map_listings $$
);

-- 검증용 쿼리 (적용 후 Supabase SQL Editor 에서 확인)
--   SELECT jobname, schedule, command FROM cron.job
--    WHERE jobname = 'refresh_mv_map_listings';
--   → schedule 컬럼이 '*/5 * * * *' 인지 확인
