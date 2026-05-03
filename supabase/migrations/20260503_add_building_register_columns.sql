-- G-33 (2026-05-03): /api/admin/violations + enrichment-progress + cron(backfill-building-info)
-- 5개 컬럼 의존하지만 listings 에 없어서 HTTP 500.
-- ADD COLUMN IF NOT EXISTS — 비파괴.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_violation_building boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_date date,
  ADD COLUMN IF NOT EXISTS violation_reason text,
  ADD COLUMN IF NOT EXISTS building_register_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS building_register_source text;

COMMENT ON COLUMN public.listings.is_violation_building IS 'data.go.kr 건축물대장 vlNoticeYn=Y 위반건축물 표시 (cron 자동).';
COMMENT ON COLUMN public.listings.approval_date IS '건축물 사용승인일 (data.go.kr useAprDay).';
COMMENT ON COLUMN public.listings.violation_reason IS '위반건축물 사유 (data.go.kr vlNoticeContent).';
COMMENT ON COLUMN public.listings.building_register_fetched_at IS '건축물대장 fetch 시각 (cron 중복 방지).';
COMMENT ON COLUMN public.listings.building_register_source IS '건축물대장 source (data_go_kr / vworld 등).';

CREATE INDEX IF NOT EXISTS idx_listings_building_register_pending
  ON public.listings (building_register_fetched_at)
  WHERE building_register_fetched_at IS NULL AND status = '공개';

CREATE INDEX IF NOT EXISTS idx_listings_violation_building
  ON public.listings (is_violation_building)
  WHERE is_violation_building = true;
