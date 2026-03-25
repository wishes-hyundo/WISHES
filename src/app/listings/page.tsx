import { Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import ListingCardActions from '@/components/ListingCardActions';

export const metadata: Metadata = {
  title: 'ë§¤ë¬¼ê²ì',
  description: 'ìì¸Â·ê²½ê¸° ì  ì§ì­ ìë£¸, í¬ë£¸, ì¤í¼ì¤í ë§¤ë¬¼ì ê²ìíì¸ì.',
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

  // ë§¤ë¬¼ ì¡°í ì¿¼ë¦¬ êµ¬ì±
  let query = supabase
    .from('listings')
    .select('*')
    .eq('status', 'ê°ì©');

  // íí° ì¡°ê±´ ì ì©
  if (params.deal) {
    query = query.eq('deal', params.deal);
  }
  if (params.type) {
    query = query.eq('type', params.type);
  }
  if (params.dong) {
    query = query.eq('dong', params.dong);
  }
  if (params.minDeposit) {
    query = query.gte('deposit', parseInt(params.minDeposit));
  }
  if (params.maxDeposit) {
    query = query.lte('deposit', parseInt(params.maxDeposit));
  }

  // ì ë ¬
  const sortColumn = params.sort === 'price' ? 'deposit'
    : params.sort === 'area' ? 'area_m2'
    : 'created_at';

  query = query.order(sortColumn, { ascending: false });

  // íì´ì§ë¤ì´ì
  query = query.range(offset, offset + pageSize - 1);

  const { data: allListings } = await query;
  const listings = allListings || [];

  // ëë³ ëª©ë¡ (íí°ì©)
  const { data: dongResults } = await supabase
    .from('listings')
    .select('dong')
    .eq('status', 'ê°ì©');

  // ì¤ë³µ ì ê±°
  const dongs = [...new Set((dongResults || []).map(r => r.dong))];

  return (
    <div className="pt-16 min-h-screen">
      {/* íì´ì§ í¤ë */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">ë§¤ë¬¼ ê²ì</h1>
          <p className="text-sm text-gray-500 mt-1">
            ìíìë ì§ì­ì ë§¤ë¬¼ì ê²ìíì¸ì
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* íí° */}
        <Suspense fallback={<div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 animate-pulse h-16" />}>
          <ListingFilters
            dongs={dongs}
            currentFilters={params}
          />
        </Suspense>

        {/* ê²°ê³¼ */}
        {listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              ì´ <strong className="text-wishes-primary">{listings.length}</strong>ê±´ì ë§¤ë¬¼
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* íì´ì§ë¤ì´ì (ê°ë¨ ë²ì ) */}
            <div className="relative flex justify-center gap-2 mt-10">
            <ListingCardActions listingId={listing.id} />
              {page > 1 && (
                <a
                  href={`/listings?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  ì´ì 
                </a>
              )}
              <span className="px-4 py-2 bg-wishes-primary text-white rounded-lg text-sm">
                {page}
              </span>
              {listings.length === pageSize && (
                <a
                  href={`/listings?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  ë¤ì
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">ê²ì ì¡°ê±´ì ë§ë ë§¤ë¬¼ì´ ììµëë¤</p>
            <p className="text-sm text-gray-400 mt-1">íí°ë¥¼ ë³ê²½í´ë³´ì¸ì</p>
          </div>
        )}
      </div>
    </div>
  );
}
