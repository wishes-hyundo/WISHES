import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';
import { applyImagePolicy } from '@/lib/image-policy';
import ListingsClient from './ListingsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '매물검색 - 서울·경기 전세 월세 매매',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가 매물을 검색하세요. 전세, 월세, 매매 매물을 지역별로 필터링하여 찾아보세요.',
  alternates: {
    canonical: 'https://wishes.co.kr/listings',
  },
  openGraph: {
    title: '매물검색 - WISHES',
    description: '서울·경기 부동산 매물을 쉽게 검색하세요.',
    url: 'https://wishes.co.kr/listings',
  },
};

// SSR - 서버에서 초기 데이터 로드 (인메모리 캐시 적용)
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const deal = (params.deal as string) || '';
  const type = (params.type as string) || '';
  const dong = (params.dong as string) || '';
  const sort = (params.sort as string) || 'latest';
  const page = parseInt((params.page as string) || '1', 10);
  const pageSize = 12;

  // 캐시 키: 필터 조합별
  const cacheKey = `ssr-listings:${deal}:${type}:${dong}:${sort}:${page}`;

  const result = await cached(
    cacheKey,
    async () => {
      const supabase = createServerClient();
      const offset = (page - 1) * pageSize;

      // 매물 쿼리
      // ※ 저작권 보호: 크롤링 매물(source_site NOT NULL)은 아래에서 applyImagePolicy 로 자체 업로드만 통과
      // ※ 제목 재가공(displayTitle) 세일즈 훅용으로 building_name / 옵션 / 준공년도 / 방향 / 설명 / 역세권 필드까지 포함
      let query = supabase
        .from('listings')
        .select(
          'id, title, building_name, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, floor_total, status, source_site, created_at, views, parking, elevator, full_option, pet, balcony, built_year, direction, description, station_name, station_distance, listing_images(url, sort_order)',
          { count: 'exact' }
        )
        .eq('status', '공개');

      if (deal) query = query.eq('deal', deal);
      // 매물유형 관대 매칭: 레거시 슬래시 값 '사무실/상가' 호환
      //   '사무실' 선택 시 '사무실' | '사무실/상가' 둘 다, '상가' 선택 시 '상가' | '사무실/상가' 둘 다 잡히게.
      if (type) {
        const safe = type.replace(/[,()]/g, '');
        query = query.or(`type.eq.${safe},type.ilike.%${safe}%`);
      }
      if (dong) query = query.eq('dong', dong);

      const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';
      query = query.order(sortColumn, { ascending: false });
      query = query.range(offset, offset + pageSize - 1);

      // 동 목록
      const dongQuery = supabase
        .from('listings')
        .select('dong')
        .eq('status', '공개')
        .not('dong', 'is', null)
        .limit(500);

      const [listingsResult, dongResult] = await Promise.all([query, dongQuery]);

      // ※ 저작권 보호 + 자체 업로드 통과
      //   - 크롤링 매물의 외부 원본 이미지는 차단
      //   - 중개사가 직접 올린 자체 업로드 이미지는 통과 (광고 노출)
      const listings = (listingsResult.data || []).map((r: any) => applyImagePolicy(r));
      const totalCount = listingsResult.count || 0;
      const dongs = [...new Set((dongResult.data || []).map((r: any) => r.dong).filter(Boolean))].sort();

      return { listings, totalCount, dongs };
    },
    30_000,    // 30초 fresh
    300_000,   // 5분 stale 허용
    3_000,     // 3초 타임아웃
  );

  if (!result) {
    // 캐시도 없고 DB도 실패 → 빈 데이터로 렌더링 (클라이언트에서 재시도)
    return <ListingsClient initialListings={[]} initialDongs={[]} totalCount={0} />;
  }

  return (
    <ListingsClient
      initialListings={result.listings}
      initialDongs={result.dongs}
      totalCount={result.totalCount}
    />
  );
}
