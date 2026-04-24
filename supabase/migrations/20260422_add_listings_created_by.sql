-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-v7-p2 (2026-04-22)
-- listings.created_by 컬럼 추가 — v7 §4 scope=mine 전파 지원
--
-- 배경:
--   /api/listings?scope=mine 와 /api/listings/stats?scope=mine 가
--   auth 사용자의 created_by 로 매물을 필터링하기 위해 컬럼 신설.
--   이전엔 컬럼이 없어 scope=mine 쿼리가 전건 실패(500) 또는 0건 반환.
--
-- 스펙:
--   nullable uuid — 기존 매물(크롤링 포함)은 NULL.
--     NULL 이면 '시스템 소유' 로 간주 → scope=mine 결과에서 자연 제외.
--   REFERENCES auth.users(id) ON DELETE SET NULL
--     중개인 계정 삭제 시 매물 자체는 살려두고 소유만 떼낸다.
--   index: 사용자별 매물 필터가 잦아 b-tree + WHERE NOT NULL 부분 인덱스.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE IF EXISTS public.listings
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_created_by_idx
  ON public.listings(created_by)
  WHERE created_by IS NOT NULL;

COMMENT ON COLUMN public.listings.created_by IS
  'v7 scope=mine 필터용 — 매물 등록한 중개인 auth.users.id. NULL 은 크롤링/시스템 소유.';
