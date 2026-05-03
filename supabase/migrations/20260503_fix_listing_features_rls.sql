-- G-45 (2026-05-03): listing_features RLS 도 status='가용' 사용 → 동일 패턴 fix
-- (G-44 후속). 모든 '가용' 정책 정리 완료.

DROP POLICY IF EXISTS listing_features_public_select ON public.listing_features;

CREATE POLICY listing_features_public_select
  ON public.listing_features
  FOR SELECT
  TO public
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE status = '공개'
    )
  );
