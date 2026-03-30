import { Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import CompareFloatingBar from '@/components/CompareFloatingBar';

// ── ISR: 60초마다 재검증 (캐싱으로 반복 방문 즉시 로딩) ──
export const revalidate = 60;

export const metadata: Metadata = {
  title: '매물검색',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔 매물을 검색하세요.',
};

interface SearchParams {
  deal?: string;
  type?: string;
  dong?: string;
  minDeposit?: string;
  maxDeposit?: string;
  sort?: string;
  page?: string;
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const pageSize = 12;
  const offset = (page - 1) * pageSize;

  const supabase = createClient();

  // 매물 조회 쿼리 구성
  let query = supabase
    .from('listings')
    .select('*, listing_images(url, sort_order)')
    .eq('status', '가용');

  // 필터 조건 적용
  if (params.deal) query = query.eq('deal', params.deal);
  if (params.type) query = query.eq('type', params.type);
  if (params.dong) query = query.eq('dong', params.dong);
  if (params.minDeposit) query = query.gte('deposit', parseInt(params.minDeposit));
  if (params.maxDeposit) query = query.lte('deposit', parseInt(params.maxDeposit));

  // 정렬
  const sortColumn = params.sort === 'price' ? 'deposit' : params.sort === 'area' ? 'area_m2' : 'created_at';
  query = query.order(sortColumn, { ascending: false });

  // 페이지네이션
  query = query.range(offset, offset + pageSize - 1);

  // ── 두 쿼리 병렬 실행 (Promise.all) ──
  const [listingsResult, dongResult] = await Promise.all([
    query,
    supabase.from('listings').select('dong').eq('status', '가용'),
  ]);

  const listings = listingsResult.data || [];
  const dongs = [...new Set((dongResult.data || []).map(r => r.dong))];

  return (
    <div className="pt-16 min-h-screen">
      {/* 페이지 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
          <p className="text-sm text-gray-500 mt-1">
            원하시는 지역의 매물을 검색하세요
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 필터 */}
        <Suspense fallback={<div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 animate-pulse h-16" />}>
          <ListingFilters dongs={dongs} currentFilters={params} />
        </Suspense>

        {/* 결과 */}
        {listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              총 <strong className="text-wishes-primary">{listings.length}</strong>건의 매물
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* 페이지네이션 */}
            <div className="flex justify-center gap-2 mt-10">
              {page > 1 && (
                <a
                  href={'/listings?' + new URLSearchParams({ ...params, page: String(page - 1) }).toString()}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  이전
                </a>
              )}
              <span className="px-4 py-2 bg-wishes-primary text-white rounded-lg text-sm">
                {page}
              </span>
              {listings.length === pageSize && (
                <a
                  href={'/listings?' + new URLSearchParams({ ...params, page: String(page + 1) }).toString()}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  다음
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">검색 조건에 맞는 매물이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">필터를 변경해보세요</p>
          </div>
        )}
      </div>
      <CompareFloatingBar />
    </div>
  );
}
