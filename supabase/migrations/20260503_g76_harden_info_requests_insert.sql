-- G-76 (2026-05-03): info_requests_insert_anon WITH CHECK (true) → 입력 검증.
-- 직접 PostgREST anon 호출 시에도 API layer 와 일관된 제약 enforce.

DROP POLICY IF EXISTS info_requests_insert_anon ON public.info_requests;

CREATE POLICY info_requests_insert_anon
ON public.info_requests
FOR INSERT
TO public
WITH CHECK (
  request_type IN ('area', 'price', 'address', 'other')
  AND length(user_contact) BETWEEN 8 AND 256
  AND (user_message IS NULL OR length(user_message) <= 1000)
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_id AND l.status = '공개'
  )
);
