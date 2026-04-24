-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-drift1 (2026-04-23)
-- /map 노출 drift 모니터링 뷰.  사용자 피드백 "다시는 이런일 없게 보완해" 방어.
--
-- 사용법:
--   SELECT * FROM v_map_coverage_drift;
-- → /search 대비 /map 에 몇 개가 안 보이는지, 원인별 집계.
--
-- 주기적 모니터링 방법:
--   - 관리자 대시보드 카드로 노출
--   - pg_cron 으로 주 1회 임계치 초과 시 관리자 알림 (L-alert 추후)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP VIEW IF EXISTS v_map_coverage_drift;
CREATE VIEW v_map_coverage_drift AS
SELECT
  (SELECT COUNT(*) FROM listings)                                    AS listings_total,
  (SELECT COUNT(*) FROM mv_map_listings)                             AS mv_visible,
  (SELECT COUNT(*) FROM listings
    WHERE status IN ('공개','계약중')
      AND (lat IS NULL OR lng IS NULL))                              AS hidden_no_coords,
  (SELECT COUNT(*) FROM listings
    WHERE status NOT IN ('공개','계약중','비공개','계약완료')
      AND status IS NOT NULL)                                        AS hidden_legacy_status,
  (SELECT COUNT(*) FROM listings WHERE status = '가용')              AS legacy_가용_should_be_0,
  (SELECT COUNT(*) FROM listings WHERE status IS NULL)               AS status_null,
  now()                                                              AS measured_at;

GRANT SELECT ON v_map_coverage_drift TO anon, authenticated;

COMMENT ON VIEW v_map_coverage_drift IS
'L-drift1: /map 노출 상태 진단. listings_total 은 /search 기준, mv_visible 은 /map 기준. '
'hidden_no_coords > 100 이면 지오코딩 파이프라인 점검 필요. '
'legacy_가용_should_be_0 > 0 이면 L-status1 CHECK constraint 가 우회되는 경로 존재 의미.';
