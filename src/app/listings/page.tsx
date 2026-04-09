import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase';
import { sortWithPhotoPriority } from '@/lib/utils';
import ListingsClient from './ListingsClient';

export const metadata: Metadata = {
  title: '매물검색 - 서울·경기 전세 월세 매매',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가 매물을 검색하세요. 전세, 월세, 매매 매물을 지역별로 필터링하여 찾아보세요.',
  openGraph: {
    title: '매물검색 - WISHES',
    description: '서울·경기 부동산 매물을 쉽게 검색하세요.',
    url: 'https://wishes.co.kr/listings',
  },
};

// S2: SSR - 서버에서 초기 데이터 로드
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

  try {
    const supabase = createClient();
    const offset = (page - 1) * pageSize;

    // 매물 쿼리 - 최신순 기본 정렬
    let query = supabase
      .from('listings')
      .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)')
      .eq('status', '가용');

    if (deal) query = query.eq('deal', deal);
    if (type) query = query.eq('type', type);
    if (dong) query = query.eq('dong', dong);

    const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';
    query = query.order(sortColumn, { ascending: false });
    query = query.range(offset, offset + pageSize - 1);

    // 동 목록 쿼리
    const dongQuery = supabase
      .from('listings')
      .select('dong')
      .eq('status', '가용');

    // 전체 개수 쿼리
    let countQuery = supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', '가용');

    if (deal) countQuery = countQuery.eq('deal', deal);
    if (type) countQuery = countQuery.eq('type', type);
    if (dong) countQuery = countQuery.eq('dong', dong);

    // 병렬 실행
    const [listingsResult, dongResult, countResult] = await Promise.all([query, dongQuery, countQuery]);

    // 사진 있는 매물 우선 정렬 적용
    const initialListings = sortWithPhotoPriority(listingsResult.data || []);
    const initialDongs = [...new Set((dongResult.data || []).map((r: any) => r.dong))].sort();
    const totalCount = countResult.count || 0;

    return (
      <ListingsClient
        initialListings={initialListings}
        initialDongs={initialDongs}
        totalCount={totalCount}
      />
    );
  } catch (error) {
    // 서버 에러 시 클라이언트 fallback
    return <ListingsClient initialListings={[]} initialDongs={[]} totalCount={0} />;
  }
}
