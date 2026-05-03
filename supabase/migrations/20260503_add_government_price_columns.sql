-- G-31 (2026-05-03): 정부 공시가격 cron 이 의존하는 컬럼들이 listings 에 없어서 500.
-- /api/admin/government-prices, /api/admin/enrichment-progress, /api/cron/enrich-land-price,
-- /api/cron/enrich-house-price 모두 이 컬럼들 사용.
-- ADD COLUMN IF NOT EXISTS — 비파괴 DDL only. 사용자 UI 영향 0.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS pnu varchar(19),
  ADD COLUMN IF NOT EXISTS land_price_year int,
  ADD COLUMN IF NOT EXISTS land_price_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS house_price_total bigint,
  ADD COLUMN IF NOT EXISTS house_price_year int,
  ADD COLUMN IF NOT EXISTS house_price_fetched_at timestamptz;

COMMENT ON COLUMN public.listings.pnu IS '국토부 19자리 필지 코드 (PNU). V-World API key.';
COMMENT ON COLUMN public.listings.land_price_year IS '공시지가 기준연도.';
COMMENT ON COLUMN public.listings.land_price_fetched_at IS '공시지가 V-World fetch 시각 (cron 중복 방지).';
COMMENT ON COLUMN public.listings.house_price_total IS '개별주택가격 (원). 정부 공식 평가액.';
COMMENT ON COLUMN public.listings.house_price_year IS '개별주택가격 기준연도.';
COMMENT ON COLUMN public.listings.house_price_fetched_at IS '개별주택가격 V-World fetch 시각.';

CREATE INDEX IF NOT EXISTS idx_listings_land_price_pending
  ON public.listings (land_price_fetched_at)
  WHERE land_price_fetched_at IS NULL AND status = '공개' AND pnu IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_house_price_pending
  ON public.listings (house_price_fetched_at)
  WHERE house_price_fetched_at IS NULL AND status = '공개' AND pnu IS NOT NULL;
