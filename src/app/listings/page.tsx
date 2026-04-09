import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase';
import ListingsClient from './ListingsClient';

export const metadata: Metadata = {
  title: '매물검색 - 서울·경기 전세 월세 매매',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가 매물을 검색하세요.',
  openGraph: {
    title: '매물검색 - WISHES',
    description: '서울·경기 부동산 매물을 쉽게 검색하세요.',
    url: 'https://wishes.co.kr/listings',
  },
};

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
    const selectFields = 'id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views';
    const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';

    // Step 1: 사진 있는 매물 전체 조회 (listing_images!inner)
    let photoQuery = supabase
      .from('listings')
      .select(selectFields + ', listing_images!inner(url, sort_order)')
      .eq('status', '가용');
    if (deal) photoQuery = photoQuery.eq('deal', deal);
    if (type) photoQuery = photoQuery.eq('type', type);
    if (dong) photoQuery = photoQuery.eq('dong', dong);
    photoQuery = photoQuery.order(sortColumn, { ascending: false }).limit(500);

    // Step 2: 동 목록 + 전체 개수
    const dongQuery = supabase.from('listings').select('dong').eq('status', '가용');
    let countQuery = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '가용');
    if (deal) countQuery = countQuery.eq('deal', deal);
    if (type) countQuery = countQuery.eq('type', type);
    if (dong) countQuery = countQuery.eq('dong', dong);

    const [photoResult, dongResult, countResult] = await Promise.all([photoQuery, dongQuery, countQuery]);

    const photoListings = photoResult.data || [];
    const photoIds = photoListings.map((l: any) => l.id);
    const photoCount = photoListings.length;
    const totalCount = countResult.count || 0;
    const initialDongs = [...new Set((dongResult.data || []).map((r: any) => r.dong))].sort();

    // Step 3: 현재 페이지 매물 (사진 우선 → 일반)
    let initialListings: any[] = [];

    if (offset < photoCount) {
      initialListings = photoListings.slice(offset, offset + pageSize);
      if (initialListings.length < pageSize) {
        const remaining = pageSize - initialListings.length;
        let npQ = supabase.from('listings').select(selectFields + ', listing_images(url, sort_order)').eq('status', '가용');
        if (deal) npQ = npQ.eq('deal', deal);
        if (type) npQ = npQ.eq('type', type);
        if (dong) npQ = npQ.eq('dong', dong);
        if (photoIds.length > 0) npQ = npQ.not('id', 'in', '(' + photoIds.join(',') + ')');
        npQ = npQ.order(sortColumn, { ascending: false }).limit(remaining);
        const npResult = await npQ;
        initialListings = [...initialListings, ...(npResult.data || [])];
      }
    } else {
      const adjustedOffset = offset - photoCount;
      let npQ = supabase.from('listings').select(selectFields + ', listing_images(url, sort_order)').eq('status', '가용');
      if (deal) npQ = npQ.eq('deal', deal);
      if (type) npQ = npQ.eq('type', type);
      if (dong) npQ = npQ.eq('dong', dong);
      if (photoIds.length > 0) npQ = npQ.not('id', 'in', '(' + photoIds.join(',') + ')');
      npQ = npQ.order(sortColumn, { ascending: false }).range(adjustedOffset, adjustedOffset + pageSize - 1);
      const npResult = await npQ;
      initialListings = npResult.data || [];
    }

    return (
      <ListingsClient
        initialListings={initialListings}
        initialDongs={initialDongs}
        totalCount={totalCount}
      />
    );
  } catch (error) {
    return <ListingsClient initialListings={[]} initialDongs={[]} totalCount={0} />;
  }
}