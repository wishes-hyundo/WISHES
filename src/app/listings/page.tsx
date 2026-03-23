import { db } from '@/db';
import { listings } from '@/db/schema';
import { eq, desc, and, gte, lte, like } from 'drizzle-orm';
import { ListingCard } from '@/components/ListingCard';
import { ListingFilters } from '@/components/ListingFilters';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ì¤ë¬¼ê²ì',
  description: 'ìì¸ ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ìë£¸, í¬ë£¼, ì¤í¼ì¤í ë§¤ë¬¼ì ê²ìíì¸ì.',
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

  // íí° ì¡°ê±´ êµ¬ì±
  const conditions = [eq(listings.status, 'ê°ì©')];

  if (params.deal) {
    conditions.push(eq(listings.deal, params.deal as any));
  }
  if (params.type) {
    conditions.push(eq(listings.type, params.type as any));
  }
  if (params.dong) {
    conditions.push(eq(listings.dong, params.dong));
  }
  if (params.minDeposit) {
    conditions.push(gte(listings.deposit, parseInt(params.minDeposit)));
  }
  if (params.maxDeposit) {
    conditions.push(lte(listings.deposit, parseInt(params.maxDeposit)));
  }

  // ì ë ¬
  const orderBy = params.sort === 'price' ? listings.deposit
    : params.sort === 'area' ? listings.area
    : listings.createdAt;

  // ë§¤ë¬¼ ì¡°í
  const allListings = await db
    .select()
    .from(listings)
    .where(and(...conditions))
    .orderBy(desc(orderBy))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // ëë³ ëª©ë¡ (íí°ì©)
  const dongResults = await db
    .select({ dong: listings.dong })
    .from(listings)
    .where(eq(listings.status, 'ê°ì©'))
    .groupBy(listings.dong);

  const dongs = dongResults.map(r => r.dong);

  return (
    <div className="pt-16 min-h-screen">
      {/* íì´ì§ í¤ë */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">ë§¤ë¬¼ ê²ì</h1>
          <p className="text-sm text-gray-500 mt-1">
            ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì§ì­ ë§¤ë¬¼ì ê²ìíì¸ì
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* íí° */}
        <ListingFilters
          dongs={dongs}
          currentFilters={params}
        />

        {/* ê²°ê³¼ */}
        {allListings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              ì´ <strong className="text-wishes-primary">{allListings.length}</strong>ê±´ì ë§¤ë¬¼
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {allListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* íì´ì§ë¤ì´ì (ê°ë¨ ë²ì ) */}
            <div className="flex justify-center gap-2 mt-10">
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
              {allListings.length === pageSize && (
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
