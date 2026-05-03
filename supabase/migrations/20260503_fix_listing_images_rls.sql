-- G-44 (2026-05-03): CRITICAL — listing_images RLS 가 status='가용' 필터링하지만
-- listings 의 실제 status 값은 '공개'. 결과: anon/public 사용자가 모든 매물에서
-- "사진 없음" 표시. 사용자 UX 치명적 결함.
--
-- 수정: '가용' → '공개' 로 일관 (listings_public_select 와 동일).
-- listing_videos 도 동일 패턴 적용.

DROP POLICY IF EXISTS listing_images_public_select ON public.listing_images;

CREATE POLICY listing_images_public_select
  ON public.listing_images
  FOR SELECT
  TO public
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE status = '공개'
    )
  );

DROP POLICY IF EXISTS listing_videos_public_select ON public.listing_videos;

CREATE POLICY listing_videos_public_select
  ON public.listing_videos
  FOR SELECT
  TO public
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE status = '공개'
    )
  );
