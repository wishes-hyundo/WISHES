import { db } from '@/db';
import { listings } from '@/db/schema';
import { eq, desc, and, gte, lte, like } from 'drizzle-orm';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '매물검색',
  description: '서울 관악구 신림동·봉천동 원룸, 투룸, 오피스텔 매물을 검색하세요.',
};

interface SearchParams {
  deal?: string; type?: string; dong?: string;
  minDeposit?: string; maxDeposit?: string; sort?: string; page?: string;
}

export default async function ListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const pageSize = 12;
  const conditions = [eq(listings.status, '가용')];
  if (params.deal) conditions.push(eq(listings.deal, params.deal as any));
  if (params.type) conditions.push(eq(listings.type, params.type as any));
  if (params.dong) conditions.push(eq(listings.dong, params.dong));
  if (params.minDeposit) conditions.push(gte(listings.deposit, parseInt(params.minDeposit)));
  if (params.maxDeposit) conditions.push(lte(listings.deposit, parseInt(params.maxDeposit)));

  const orderBy = params.sort === 'price' ? listings.deposit : params.sort === 'area' ? listings.area : listings.createdAt;

  const allListings = await db.select().from(listings).where(and(...conditions)).orderBy(desc(orderBy)).limit(pageSize).offset((page - 1) * pageSize);
  const dongResults = await db.select({ dong: listings.dong }).from(listings).where(eq(listings.status, '가용')).groupBy(listings.dong);
  const dongs = dongResults.map(r => r.dong);

  return (
    <div className="pt-16 min-h-screen">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
          <p className="text-sm text-gray-500 mt-1">관악구 신림동·봉천동 지역 매물을 검색하세요</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ListingFilters dongs={dongs} currentFilters={params} />
        {allListings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">총 <strong className="text-wishes-primary">{allListings.length}</strong>건의 매물</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {allListings.map((listing) => (<ListingCard key={listing.id} listing={listing as any} />))}
            </div>
            <div className="flex justify-center gap-2 mt-10">
              {page > 1 && (<a href={`/listings?${new URLSearchParams({ ...params, page: String(page - 1) })}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">이전</a>)}
              <span className="px-4 py-2 bg-wishes-primary text-white rounded-lg text-sm">{page}</span>
              {allListings.length === pageSize && (<a href={`/listings?${new URLSearchParams({ ...params, page: String(page + 1) })}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">다음</a>)}
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
    </div>
  );
}
