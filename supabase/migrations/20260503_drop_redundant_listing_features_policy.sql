-- G-56 (2026-05-03): listing_features 에 'USING(true)' 오래된 정책 DROP.
-- G-45 정책만 유지 → 비공개 매물 features 차단.

DROP POLICY IF EXISTS "Allow public select listing_features" ON public.listing_features;
