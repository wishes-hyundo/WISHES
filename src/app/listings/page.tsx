import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase';
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

// 5초 타임아웃 래퍼
const withTimeout = <T,>(promise: Promise<T>, ms = 3000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

// SSR - 서버에서 초기 데이터 로드 (성능 최적화)
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

    // 매물 쿼리 (필요한 필드만 선택 + count 통합으로 쿼리 1개 절약)
    let query = supabase
      .from('listings')
      .select(
        'id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)',
        { count: 'exact' }
      )
      .eq('status', '공개');

    if (deal) query = query.eq('deal', deal);
    if (type) query = query.eq('type', type);
    if (dong) query = query.eq('dong', dong);

    const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';
    query = query.order(sortColumn, { ascending: false });
    query = query.range(offset, offset + pageSize - 1);

    // 동 목록: DISTINCT dong만 가져옴 (경량화)
    const dongQuery = supabase
      .from('listings')
      .select('dong')
      .eq('status', '공개')
      .not('dong', 'is', null)
      .limit(500);

    // 2개 쿼리 병렬 실행 + 5초 타임아웃
    const [listingsResult, dongResult] = await withTimeout(
      Promise.all([query, dongQuery])
    );

    const initialListings = listingsResult.data || [];
    const totalCount = listingsResult.count || 0;
    const initialDongs = [...new Set((dongResult.data || []).map((r: any) => r.dong).filter(Boolean))].sort();

    return (
      <ListingsClient
        initialListings={initialListings}
        initialDongs={initialDongs}
        totalCount={totalCount}
      />
    );
  } catch (error) {
    // 서버 에러/타임아웃 시 빈 데이터로 즉시 렌더 (클라이언트에서 재시도)
    return <ListingsClient initialListings={[]} initialDongs={[]} totalCount={0} />;
  }
}
