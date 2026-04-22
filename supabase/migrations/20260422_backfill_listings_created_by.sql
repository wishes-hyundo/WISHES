-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-v7-p5 (2026-04-22)
-- listings.created_by 조건부 백필 — 기존 수동 등록 매물을 슈퍼어드민 wishes 에게 귀속
--
-- 배경:
--   2026-04-22 L-v7-p2 에서 listings.created_by 컬럼 신설(20260422_add_listings_created_by.sql).
--   신규 등록은 POST /api/admin/listings 가 JWT 에서 UID 추출해 기록(build i 에서
--   admin_bridge_ prefix 스트립 수정 완료). 그러나 컬럼 신설 이전의 기존 6,204 건은
--   created_by = NULL 박제. /search 의 "내 매물" 토글이 0 건만 나오는 반쪽짜리
--   상태로 출시되는 것을 방지하기 위해 백필.
--
-- 스펙:
--   UPDATE 대상:
--     created_by IS NULL      — 이미 기록된 건은 절대 건드리지 않음
--     source_site IS NULL     — 크롤링(onhouse / gongsilclub / …) 건은 NULL 유지.
--                                크롤러 매물이 "내 매물"로 오염되면 scope 토글이
--                                의미를 잃음. 출처를 가진 매물은 항상 "시스템 소유".
--   귀속 UID:
--     auth.users 테이블에서 email='wishes@wishes.co.kr' 의 id 조회.
--     adminAuth.ts 의 SUPERADMIN_EMAILS 와 일치.
--     조회 실패 시 RAISE EXCEPTION — 데이터 절대 오염 방지.
--
-- 검증(dry-run, 실행 전 권장):
--   SELECT COUNT(*) AS will_backfill
--     FROM public.listings
--    WHERE created_by IS NULL AND source_site IS NULL;
--
--   SELECT source_site, COUNT(*) FROM public.listings
--    WHERE created_by IS NULL GROUP BY source_site ORDER BY 2 DESC;
--
-- 롤백:
--   UPDATE public.listings SET created_by = NULL
--    WHERE created_by = (SELECT id FROM auth.users WHERE lower(email)='wishes@wishes.co.kr')
--      AND source_site IS NULL;
--   (본 백필은 source_site IS NULL 인 건만 건드렸으므로 동일 조건으로 롤백 안전)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  wishes_uid uuid;
  affected   integer;
  preview    integer;
BEGIN
  -- 1) wishes 슈퍼어드민 UID 확정
  SELECT id INTO wishes_uid
    FROM auth.users
   WHERE lower(email) = 'wishes@wishes.co.kr'
   LIMIT 1;

  IF wishes_uid IS NULL THEN
    RAISE EXCEPTION
      '[L-v7-p5] wishes@wishes.co.kr 가 auth.users 에 없습니다. 슈퍼어드민 가입 후 재실행하세요.';
  END IF;

  -- 2) dry-run preview — 몇 건이 바뀔지 로그에 남김
  SELECT COUNT(*) INTO preview
    FROM public.listings
   WHERE created_by IS NULL
     AND source_site IS NULL;

  RAISE NOTICE '[L-v7-p5] backfill target=% rows (source_site IS NULL AND created_by IS NULL) uid=%',
    preview, wishes_uid;

  -- 3) 실제 UPDATE — 크롤러 매물(source_site IS NOT NULL) 은 NULL 유지
  UPDATE public.listings
     SET created_by = wishes_uid
   WHERE created_by IS NULL
     AND source_site IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;

  RAISE NOTICE '[L-v7-p5] backfilled=% rows', affected;

  -- 4) 사후 정합성 체크
  IF affected <> preview THEN
    RAISE EXCEPTION
      '[L-v7-p5] preview(%) <> affected(%) — 동시 INSERT 등 경합 가능성. 롤백 권장.',
      preview, affected;
  END IF;
END $$;
