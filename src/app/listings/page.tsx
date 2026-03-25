import { Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ã«Â§Â¤Ã«Â¬Â¼ÃªÂ²ÂÃ¬ÂÂ',
  description: 'Ã¬ÂÂÃ¬ÂÂ¸ÃÂ·ÃªÂ²Â½ÃªÂ¸Â° Ã¬Â Â Ã¬Â§ÂÃ¬ÂÂ­ Ã¬ÂÂÃ«Â£Â¸, Ã­ÂÂ¬Ã«Â£Â¸, Ã¬ÂÂ¤Ã­ÂÂ¼Ã¬ÂÂ¤Ã­ÂÂ Ã«Â§Â¤Ã«Â¬Â¼Ã¬ÂÂ ÃªÂ²ÂÃ¬ÂÂÃ­ÂÂÃ¬ÂÂ¸Ã¬ÂÂ.',
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

  // Ã«Â§Â¤Ã«Â¬Â¼ Ã¬Â¡Â°Ã­ÂÂ Ã¬Â¿Â¼Ã«Â¦Â¬ ÃªÂµÂ¬Ã¬ÂÂ±
  let query = supabase
    .from('listings')
    .select('*')
    .eq('status', 'ÃªÂ°ÂÃ¬ÂÂ©');

  // Ã­ÂÂÃ­ÂÂ° Ã¬Â¡Â°ÃªÂ±Â´ Ã¬Â ÂÃ¬ÂÂ©
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

  // Ã¬Â ÂÃ«Â Â¬
  const sortColumn = params.sort === 'price' ? 'deposit'
    : params.sort === 'area' ? 'area_m2'
    : 'created_at';

  query = query.order(sortColumn, { ascending: false });

  // Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«ÂÂ¤Ã¬ÂÂ´Ã¬ÂÂ
  query = query.range(offset, offset + pageSize - 1);

  const { data: allListings } = await query;
  const listings = allListings || [];

  // Ã«ÂÂÃ«Â³Â Ã«ÂªÂ©Ã«Â¡Â (Ã­ÂÂÃ­ÂÂ°Ã¬ÂÂ©)
  const { data: dongResults } = await supabase
    .from('listings')
    .select('dong')
    .eq('status', 'ÃªÂ°ÂÃ¬ÂÂ©');

  // Ã¬Â¤ÂÃ«Â³Âµ Ã¬Â ÂÃªÂ±Â°
  const dongs = [...new Set((dongResults || []).map(r => r.dong))];

  return (
    <div className="pt-16 min-h-screen">
      {/* Ã­ÂÂÃ¬ÂÂ´Ã¬Â§Â Ã­ÂÂ¤Ã«ÂÂ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">Ã«Â§Â¤Ã«Â¬Â¼ ÃªÂ²ÂÃ¬ÂÂ</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ã¬ÂÂÃ­ÂÂÃ¬ÂÂÃ«ÂÂ Ã¬Â§ÂÃ¬ÂÂ­Ã¬ÂÂ Ã«Â§Â¤Ã«Â¬Â¼Ã¬ÂÂ ÃªÂ²ÂÃ¬ÂÂÃ­ÂÂÃ¬ÂÂ¸Ã¬ÂÂ
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Ã­ÂÂÃ­ÂÂ° */}
        <Suspense fallback={<div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 animate-pulse h-16" />}>
          <ListingFilters
            dongs={dongs}
            currentFilters={params}
          />
        </Suspense>

        {/* ÃªÂ²Â°ÃªÂ³Â¼ */}
        {listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Ã¬Â´Â <strong className="text-wishes-primary">{listings.length}</strong>ÃªÂ±Â´Ã¬ÂÂ Ã«Â§Â¤Ã«Â¬Â¼
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«ÂÂ¤Ã¬ÂÂ´Ã¬ÂÂ (ÃªÂ°ÂÃ«ÂÂ¨ Ã«Â²ÂÃ¬Â Â) */}
            <div className="flex justify-center gap-2 mt-10">
              {page > 1 && (
                <a
                  href={`/listings?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Ã¬ÂÂ´Ã¬Â Â
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
                  Ã«ÂÂ¤Ã¬ÂÂ
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">ÃªÂ²ÂÃ¬ÂÂ Ã¬Â¡Â°ÃªÂ±Â´Ã¬ÂÂ Ã«Â§ÂÃ«ÂÂ Ã«Â§Â¤Ã«Â¬Â¼Ã¬ÂÂ´ Ã¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤</p>
            <p className="text-sm text-gray-400 mt-1">Ã­ÂÂÃ­ÂÂ°Ã«Â¥Â¼ Ã«Â³ÂÃªÂ²Â½Ã­ÂÂ´Ã«Â³Â´Ã¬ÂÂ¸Ã¬ÂÂ</p>
          </div>
        )}
      </div>
    </div>
  );
}
