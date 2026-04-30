-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PR-G2-AREA — 면적 거버넌스 시스템 (2026-04-30)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- 사장님 명령:
--   "면적 정보 부족해도 광고 진행. 비공개 처리 X (영업 손실)."
--   "건축물대장에도 정보 없는 매물 존재 — 절대 확인 불가도 광고 X 비공개"
--   "사용자 UI 부정적 표시 X — 마케팅 효과 보호"
--
-- 결과 (적용 직후):
--   - 6,315건 광고 즉시 복원 (비공개 → 공개)
--   - 6,883건 면적 자동 보강 (정규식 + 동평균 + type평균)
--   - 9건만 area_m2 = 0 잔여 (29,475 중 0.03%)
--
-- 적용 대상: Supabase project xbjgdsyukjdkfvcbzmjc
-- 적용 일시: 2026-04-30 KST
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ════════════════════════════════════════════════════════════════════
-- 1) 6,315건 광고 즉시 복원 (영업 회복)
-- ════════════════════════════════════════════════════════════════════
UPDATE public.listings
SET status = '공개', updated_at = NOW()
WHERE status = '비공개'
  AND area_m2 = 0
  AND (problematic_reason IS NULL OR problematic_reason = '');

-- ════════════════════════════════════════════════════════════════════
-- 2) auto_fix_problematic_listings 수정 (hidden_area_invalid 로직 제거)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_fix_problematic_listings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_wonroom bigint := 0;
  c_tworoom bigint := 0;
BEGIN
  WITH fixed AS (
    UPDATE public.listings
    SET rooms = 1, is_problematic = false, problematic_reason = NULL,
        problematic_marked_at = NULL, updated_at = now()
    WHERE type = '원룸' AND rooms IS NOT NULL AND rooms > 1
    RETURNING 1
  ) SELECT count(*) INTO c_wonroom FROM fixed;

  WITH fixed AS (
    UPDATE public.listings
    SET rooms = 2, is_problematic = false, problematic_reason = NULL,
        problematic_marked_at = NULL, updated_at = now()
    WHERE type = '투룸' AND rooms IS NOT NULL AND rooms <> 2
    RETURNING 1
  ) SELECT count(*) INTO c_tworoom FROM fixed;

  -- PR-G2-AREA: hidden_area_invalid 로직 제거 (영업 손실 방지)
  --   면적 미확정 매물도 광고 진행. enrichment 함수가 가능한 source 에서 보강.

  INSERT INTO public.admin_audit_log (action, target_type, meta)
  VALUES ('auto_fix_problematic_run', 'system',
    jsonb_build_object('wonroom_fixed', c_wonroom, 'tworoom_fixed', c_tworoom,
      'measured_at', now(),
      'note', 'PR-G2-AREA: hidden_area_invalid removed (사장님 영업 손실 방지)'));

  RETURN jsonb_build_object('wonroom_fixed', c_wonroom, 'tworoom_fixed', c_tworoom,
    'hidden_area_invalid', 0);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════
-- 3) Schema 보강 — area_source / area_confidence / area_split_suspected
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS area_source text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS area_confidence smallint;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS area_measured_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS area_measured_by uuid;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS area_split_suspected boolean DEFAULT false;

COMMENT ON COLUMN public.listings.area_source IS 'PR-G2-AREA: measured|building_registry|rtms_match|photo_ocr|text_extracted|broker_reported|dong_avg_estimated|type_avg_estimated|unknown';
COMMENT ON COLUMN public.listings.area_confidence IS 'PR-G2-AREA: 0-100. measured=100, building_registry=95, rtms_match=90, photo_ocr=85, text_extracted=70-75, broker_reported=60, dong_avg=40, type_avg=20';
COMMENT ON COLUMN public.listings.area_split_suspected IS 'PR-G2-AREA: 방 쪼갬 의심 (빌라/다가구). 사용자 UI 표시 X, admin 만';

UPDATE public.listings
SET area_source = 'broker_reported', area_confidence = 60
WHERE area_source IS NULL AND area_m2 > 0;

UPDATE public.listings
SET area_source = 'unknown', area_confidence = 0
WHERE area_source IS NULL AND (area_m2 IS NULL OR area_m2 = 0);

-- 인덱스 (admin 큐 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_listings_area_unknown ON public.listings (area_source) WHERE area_source = 'unknown';
CREATE INDEX IF NOT EXISTS idx_listings_area_low_confidence ON public.listings (area_confidence) WHERE area_confidence < 60;
CREATE INDEX IF NOT EXISTS idx_listings_area_split_suspected ON public.listings (area_split_suspected) WHERE area_split_suspected = true;

-- ════════════════════════════════════════════════════════════════════
-- 4) 4 enrichment 함수
-- ════════════════════════════════════════════════════════════════════

-- 함수 1: 텍스트 정규식 추출 (description / title / raw_fields)
CREATE OR REPLACE FUNCTION public.enrich_area_from_text()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  c_pyeong bigint := 0;
  c_sqm bigint := 0;
BEGIN
  WITH src AS (
    SELECT id,
      LEAST(1000, GREATEST(5,
        ((regexp_match(
          COALESCE(description,'') || ' ' || COALESCE(title,'') || ' ' || COALESCE(raw_fields::text,''),
          '(\d+(?:\.\d+)?)\s*(?:평|평형)'
        ))[1])::numeric * 3.3058
      ))::numeric(8,2) AS calculated_area
    FROM public.listings
    WHERE (area_m2 IS NULL OR area_m2 = 0)
      AND (COALESCE(description,'') || ' ' || COALESCE(title,'') || ' ' || COALESCE(raw_fields::text,'')) ~ '\d+(?:\.\d+)?\s*(?:평|평형)'
  ),
  u AS (
    UPDATE public.listings l
    SET area_m2 = src.calculated_area,
        area_supply_m2 = GREATEST(COALESCE(l.area_supply_m2, 0), src.calculated_area),
        area_source = 'text_extracted', area_confidence = 70,
        updated_at = now()
    FROM src WHERE l.id = src.id RETURNING 1
  ) SELECT count(*) INTO c_pyeong FROM u;

  WITH src AS (
    SELECT id,
      LEAST(1000, GREATEST(5,
        ((regexp_match(
          COALESCE(description,'') || ' ' || COALESCE(title,'') || ' ' || COALESCE(raw_fields::text,''),
          '(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)'
        ))[1])::numeric
      ))::numeric(8,2) AS calculated_area
    FROM public.listings
    WHERE (area_m2 IS NULL OR area_m2 = 0)
      AND (COALESCE(description,'') || ' ' || COALESCE(title,'') || ' ' || COALESCE(raw_fields::text,'')) ~ '\d+(?:\.\d+)?\s*(?:㎡|m2|제곱미터)'
  ),
  u AS (
    UPDATE public.listings l
    SET area_m2 = src.calculated_area,
        area_supply_m2 = GREATEST(COALESCE(l.area_supply_m2, 0), src.calculated_area),
        area_source = 'text_extracted', area_confidence = 75,
        updated_at = now()
    FROM src WHERE l.id = src.id RETURNING 1
  ) SELECT count(*) INTO c_sqm FROM u;

  RETURN jsonb_build_object('pyeong_extracted', c_pyeong, 'sqm_extracted', c_sqm);
END;
$function$;

-- 함수 2: 같은 동·type 평균 추정
CREATE OR REPLACE FUNCTION public.enrich_area_from_dong_type_avg()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  c_estimated bigint := 0;
BEGIN
  WITH avg AS (
    SELECT dong, type, ROUND(AVG(area_m2)::numeric, 2) AS avg_area
    FROM public.listings
    WHERE area_m2 BETWEEN 5 AND 500 AND dong IS NOT NULL AND type IS NOT NULL
    GROUP BY dong, type HAVING COUNT(*) >= 3
  ),
  u AS (
    UPDATE public.listings l
    SET area_m2 = avg.avg_area,
        area_supply_m2 = GREATEST(COALESCE(l.area_supply_m2, 0), avg.avg_area),
        area_source = 'dong_avg_estimated', area_confidence = 40,
        updated_at = now()
    FROM avg
    WHERE l.dong = avg.dong AND l.type = avg.type
      AND (l.area_m2 IS NULL OR l.area_m2 = 0)
    RETURNING 1
  ) SELECT count(*) INTO c_estimated FROM u;
  RETURN jsonb_build_object('dong_avg_estimated', c_estimated);
END;
$function$;

-- 함수 3: 방 쪼갬 의심 자동 라벨 (admin 표시 only)
CREATE OR REPLACE FUNCTION public.enrich_area_split_detection()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  c_addr_pattern bigint := 0;
  c_same_addr_multi bigint := 0;
BEGIN
  WITH u AS (
    UPDATE public.listings
    SET area_split_suspected = true, updated_at = now()
    WHERE type IN ('빌라','다세대','다가구','단독주택')
      AND COALESCE(area_split_suspected, false) = false
      AND (address ~ '\d+\s*-\s*\d+\s*-\s*\d+' OR address ~ '\d+호\s*-\s*\d+')
    RETURNING 1
  ) SELECT count(*) INTO c_addr_pattern FROM u;

  WITH split AS (
    SELECT address FROM public.listings
    WHERE type IN ('빌라','다세대','다가구','단독주택') AND address IS NOT NULL
    GROUP BY address HAVING COUNT(*) >= 2
  ),
  u AS (
    UPDATE public.listings l
    SET area_split_suspected = true, updated_at = now()
    FROM split
    WHERE l.address = split.address
      AND l.type IN ('빌라','다세대','다가구','단독주택')
      AND COALESCE(l.area_split_suspected, false) = false
    RETURNING 1
  ) SELECT count(*) INTO c_same_addr_multi FROM u;

  RETURN jsonb_build_object('address_pattern', c_addr_pattern, 'same_addr_multi', c_same_addr_multi);
END;
$function$;

-- 함수 4: type 평균 fallback
CREATE OR REPLACE FUNCTION public.enrich_area_from_type_avg()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  c_fallback bigint := 0;
BEGIN
  WITH type_avg AS (
    SELECT type, ROUND(AVG(area_m2)::numeric, 2) AS avg_area
    FROM public.listings
    WHERE area_m2 BETWEEN 5 AND 500 AND type IS NOT NULL
    GROUP BY type HAVING COUNT(*) >= 10
  ),
  u AS (
    UPDATE public.listings l
    SET area_m2 = type_avg.avg_area,
        area_supply_m2 = GREATEST(COALESCE(l.area_supply_m2, 0), type_avg.avg_area),
        area_source = 'type_avg_estimated', area_confidence = 20,
        updated_at = now()
    FROM type_avg
    WHERE l.type = type_avg.type
      AND (l.area_m2 IS NULL OR l.area_m2 = 0)
    RETURNING 1
  ) SELECT count(*) INTO c_fallback FROM u;
  RETURN jsonb_build_object('type_avg_fallback', c_fallback);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════
-- 5) Wrapper + pg_cron (매일 03:00 KST 정기 실행)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.run_daily_enrichment()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  result := jsonb_build_object(
    'rooms_bathrooms', public.auto_extract_rooms_bathrooms_from_raw(),
    'options', public.auto_extract_options_from_raw_fields(),
    'problematic_fix', public.auto_fix_problematic_listings(),
    'trust_score', public.auto_calculate_trust_score(),
    'jeonse_risk', public.auto_detect_jeonse_risk(),
    'area_text', public.enrich_area_from_text(),
    'area_dong_avg', public.enrich_area_from_dong_type_avg(),
    'area_split', public.enrich_area_split_detection(),
    'area_type_fallback', public.enrich_area_from_type_avg(),
    'measured_at', now()
  );
  INSERT INTO public.admin_audit_log (action, target_type, meta)
  VALUES ('daily_enrichment_run', 'system', result);
  RETURN result;
END;
$function$;

-- 매일 03:00 KST = 18:00 UTC (전날) 실행
SELECT cron.schedule('pr_g2_daily_enrichment', '0 18 * * *',
  $$ SELECT public.run_daily_enrichment(); $$);

-- ════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 결과 확인)
-- ════════════════════════════════════════════════════════════════════
-- SELECT status, COUNT(*) FROM listings GROUP BY status;
-- SELECT area_source, COUNT(*) FROM listings GROUP BY area_source ORDER BY COUNT(*) DESC;
-- SELECT cron.jobname FROM cron.job WHERE jobname LIKE 'pr_g2%';
