-- G-100 (2026-05-04): 진짜 인기 동 (매물 수 기준) RPC.
-- 이전: page.tsx 가 listings.select('dong').limit(300) 후 클라이언트 카운팅 →
--   PostgreSQL 이 ORDER BY 없이 첫 300 rows 만 반환 → 가나다 순 "가" 동들만 카운트.
--   결과: "인기 동" chip 에 가산동/가리봉동/가곡로/가마을안길 표시.
-- 이후: SQL GROUP BY + ORDER BY count DESC 로 진짜 매물 수 기준 top N.

CREATE OR REPLACE FUNCTION public.popular_dongs(n integer DEFAULT 8)
RETURNS TABLE(dong text, listing_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT dong, COUNT(*) AS listing_count
  FROM listings
  WHERE status = '공개' AND dong IS NOT NULL AND dong <> ''
  GROUP BY dong
  ORDER BY listing_count DESC
  LIMIT GREATEST(LEAST(n, 50), 1);
$$;

GRANT EXECUTE ON FUNCTION public.popular_dongs(integer) TO anon, authenticated;
