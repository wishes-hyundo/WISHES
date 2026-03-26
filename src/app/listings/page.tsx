import { Suspense } from 'react';

export const revalidate = 60;
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

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
  search?: string;
  listingNumber?: string;
}

const LISTING_COLUMNS = 'id,deal,price,deposit,monthly,images,title,area_m2,area,floor_current,floor,elevator,type,dong,address,parking,pet,status,created_at';

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

  // Dong list query (shared) - will run in parallel
  const dongQuery = supabase.from('listings').select('dong').eq('status', '가용');

  // If searching by listing number, do exact ID match
  if (params.listingNumber) {
    const listingId = parseInt(params.listingNumber, 10);
    const [{ data: listing }, { data: dongResults }] = await Promise.all([
      supabase.from('listings').select('*').eq('id', listingId).eq('status', '가용').single(),
      dongQuery,
    ]);

    const listings = listing ? [listing] : [];
    const dongs = [...new Set((dongResults || []).map((r: any) => r.dong).filter(Boolean))];

    return (
      <div className="pt-16 min-h-screen">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
            <p className="text-sm text-gray-500 mt-1">
              매물번호 <strong className="text-wishes-primary">#{params.listingNumber}</strong> 검색 결과
            </p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <ListingFilters dongs={dongs} currentFilters={params} />
          {listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {listings.map((l) => (<ListingCard key={l.id} listing={l as any} />))}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>해당 매물번호를 찾을 수 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular search with filters
  let query = supabase.from('listings').select(LISTING_COLUMNS).eq('status', '가용');

  if (params.search) {
    const s = params.search;
    query = query.or(`title.ilike.%${s}%,address.ilike.%${s}%,dong.ilike.%${s}%,type.ilike.%${s}%`);
  }
  if (params.deal) { query = query.eq('deal', params.deal); }
  if (params.type) { query = query.eq('type', params.type); }
  if (params.dong) { query = query.eq('dong', params.dong); }
  if (params.minDeposit) { query = query.gte('deposit', parseInt(params.minDeposit, 10)); }
  if (params.maxDeposit) { query = query.lte('deposit', parseInt(params.maxDeposit, 10)); }

  const sortColumn = params.sort === 'price' ? 'deposit' : params.sort === 'area' ? 'area_m2' : 'created_at';
  query = query.order(sortColumn, { ascending: false });
  query = query.range(offset, offset + pageSize - 1);

  // Run listings + dong queries in PARALLEL (performance optimization)
  const [{ data: allListings }, { data: dongResults }] = await Promise.all([
    query,
    dongQuery,
  ]);

  const listings = allListings || [];
  const dongs = [...new Set((dongResults || []).map((r: any) => r.dong).filter(Boolean))];
  const totalCount = listings.length;
  const totalPages = totalCount < pageSize ? page : page + 1;

  return (
    <div className="pt-16 min-h-screen">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
          <p className="text-sm text-gray-500 mt-1">원하시는 지역의 매물을 검색하세요</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ListingFilters dongs={dongs} currentFilters={params} />
        {listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mt-4 mb-4">총 <strong className="text-wishes-dark">{totalCount}건</strong>의 매물</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {listings.map((listing) => (<ListingCard key={listing.id} listing={listing as any} />))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
                  <a
                    key={p}
                    href={`/listings?${new URLSearchParams(Object.fromEntries(Object.entries({...params, page: String(p)}).filter(([_, v]) => v !== undefined))).toString()}`}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      p === page
                        ? 'bg-wishes-primary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p}
                  </a>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>검색 결과가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
