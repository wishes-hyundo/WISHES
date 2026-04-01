'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Building2, SlidersHorizontal } from 'lucide-react';

const dealTypes = ['ì „ì„¸', 'ì›”ì„¸', 'ë§¤ë§¤'];
const listingTypes = ['ì›ë£¸', 'íˆ¬ë£·', 'ì“°ë¦¬ë£´', 'ì˜¤í”¼ìŠ¤í…”', 'ì•„íŒŒíŠ¸', 'ìƒê°€', 'ì‚¬ë¬´ì‹¤'];
const sortOptions = [
  { value: 'latest', label: 'ìµœì‹ ìˆœ' },
  { value: 'price', label: 'ê°€ê²©ìˆœ' },
  { value: 'area', label: 'ë©”ì ìˆœ' },
];

interface ListingsClientProps {
  initialListings?: any[];
  initialDongs?: string[];
  totalCount?: number;
}

export default function ListingsClient({
  initialListings = [],
  initialDongs = [],
  totalCount = 0,
}: ListingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<any[]>(initialListings);
  const [dongs, setDongs] = useState<string[]>(initialDongs);
  const [total, setTotal] = useState(totalCount);
  // S2: SSR ì´ˆê¸° ë°ì´í„°ê°€ ìžˆìœ¼ë©” ë¡œë”© ìƒíƒœ ê±´ë„ˆëœ€
  const [loading, setLoading] = useState(initialListings.length === 0 && totalCount === 0);
  const [page, setPage] = useState(1);
  const hasInitialData = useRef(initialListings.length > 0 || totalCount > 0);

  const deal = searchParams.get('deal') || '';
  const type = searchParams.get('type') || '';
  const dong = searchParams.get('dong') || '';
  const sort = searchParams.get('sort') || 'latest';
  const pageParam = searchParams.get('page') || '1';
  const pageSize = 12;

  // ë°ì´í„° ë¡œë“œ (í•„í„° ë³€ê²½ ì‹œ í´ë¼ì´ì–¸íŠ¸ì—ì„œ ìž¬ë¡œë“œ)
  useEffect(() => {
    const currentPage = parseInt(pageParam, 10) || 1;
    setPage(currentPage);

    // ì²« ë Œë”ë§ ì‹œ SSR ë°ì´í„°ê°€ ìžˆìœ¼ë©´ ìŠ¤í‚µ
    if (hasInitialData.current) {
      hasInitialData.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();
      const offset = (currentPage - 1) * pageSize;

      // ë§¤ë¬¼ ì¿¼ë¦¬
      let query = supabase
        .from('listings')
        .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)')
        .eq('status', 'ê°€ìš©');

      if (deal) query = query.eq('deal', deal);
      if (type) query = query.eq('type', type);
      if (dong) query = query.eq('dong', dong);

      const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';
      query = query.order(sortColumn, { ascending: false });
      query = query.range(offset, offset + pageSize - 1);

      // ë™ ëª©ë¡ ì¿¼ë¦¬
      const dongQuery = supabase
        .from('listings')
        .select('dong')
        .eq('status', 'ê°€ìš©');

      // ì „ì²´ ê°œìˆ˜ ì¿¼ë¦¬
      let countQuery = supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ê°€ìš©');

      if (deal) countQuery = countQuery.eq('deal', deal);
      if (type) countQuery = countQuery.eq('type', type);
      if (dong) countQuery = countQuery.eq('dong', dong);

      // ë³‘ë ¬ ì‹¤í–‰
      const [listingsResult, dongResult, countResult] = await Promise.all([query, dongQuery, countQuery]);

      setListings(listingsResult.data || []);
      setDongs([...new Set((dongResult.data || []).map((r: any) => r.dong))].sort());
      setTotal(countResult.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [deal, type, dong, sort, pageParam]);

  // â”€â”€ V4-05: ìŠ¤í¬ë¡¤ ìœ„ì¹˜ ì €ìž¥ / ë³µì› â”€â”€
  const scrollSaved = useRef(false);
  // ì²« ë Œë”ë§ ì—¬ë¶€ ì¶”ì : ìƒì„¸ â†’ ëª©ë¡ ë³µê·€ ì‹œ cleanupì´ sessionStorageë¥¼ ì§€ìš°ì§€ ì•Šë„ë¡
  const isFirstRender = useRef(true);

  // ìŠ¤í¬ë¡¤ ì´ë™ ì‹œ ìœ„ì¹˜ ì €ìž¥
  useEffect(() => {
    const SCROLL_KEY = 'listings_scroll';
    const handleScroll = () => {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({
        url: window.location.href,
        y: window.scrollY,
      }));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ë°ì´í„° ë¡œë“œ ì™„ë£Œ í›„ ìŠ¤í¬ë¡¤ ë³µì› (ìƒì„¸ â†’ ëª©ë¡ ë³µê·€ ì‹œ)
  useEffect(() => {
    if (!loading && !scrollSaved.current) {
      scrollSaved.current = true;
      try {
        const raw = sessionStorage.getItem('listings_scroll');
        if (raw) {
          const { url, y } = JSON.parse(raw);
          if (url === window.location.href && y > 0) {
            requestAnimationFrame(() => {
              window.scrollTo({ top: y, behavior: 'instant' });
            });
          }
        }
      } catch {}
    }
  }, [loading]);

  // í•„í„° ë³€ê²½ ì‹œ ìŠ¤í¬ë¡¤ ì €ìž¥ê°’ ì´ˆê¸°í™” (ì²« ë Œë”ë§ì€ ì œì™¸ â€” ë³µê·€ ì‹œ ìœ„ì¹˜ ë³´ì¡´)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scrollSaved.current = false;
    sessionStorage.removeItem('listings_scroll');
  }, [deal, type, dong, sort, pageParam]);

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="pt-16 min-h-screen">
      {/* íŽ˜ì´ì§€ í—¤ë” */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumb items={[{ label: 'ë§¤ë¬¼ ê²€ìƒ‰' }]} />
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-6">
          <h1 className="text-2xl font-bold text-wishes-primary">ë§¤ë¬¼ ê²€ìƒ‰</h1>
          <p className="text-sm text-gray-500 mt-1">
            ì›í•˜ì‹œëŠ” ì§€ì—­ç²t ë§¤ë¬¼ì„ ê²€ìƒ‰í•˜ì„¸ìš”
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* í•„í„° */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">í•„í„°</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <select
              value={deal}
              onChange={(e) => updateFilter('deal', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">ê±°ëž˜ìœ í˜• ì „ì²´</option>
              {dealTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">ë§¤ë¬¼ìœ í˜• ì „ì²´</option>
              {listingTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={dong}
              onChange={(e) => updateFilter('dong', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">ì§€ì—­ ì „ì²´</option>
              {dongs.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ê²°ê³¼ */}
        {loading ? (
          <div>
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ) : listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              ì´ <strong className="text-wishes-primary">{total}</strong>ê±´ì˜ ë§¤ë¬¼
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* íŽ˜ì´ì§€ë„¤ì´ì…˜ */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                {page > 1 && (
                  <a
                    href={`/listings?${new URLSearchParams({ ...(deal && { deal }), ...(type && { type }), ...(dong && { dong }), sort, page: String(page - 1) }).toString()}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    ì´ì „
                  </a>
                )}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = startPage + i;
                  if (p > totalPages) return null;
                  return (
                    <a
                      key={p}
                      href={`/listings?${new URLSearchParams({ ...(deal && { deal }), ...(type && { type }), ...(dong && { dong }), sort, page: String(p) }).toString()}`}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        p === page
                          ? 'bg-wishes-primary text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </a>
                  );
                })}
                {page < totalPages && (
                  <a
                    href={`/listings?${new URLSearchParams({ ...(deal && { deal }), ...(type && { type }), ...(dong && { dong }), sort, page: String(page + 1) }).toString()}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    ë‹¤ìŒ
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">ê²€ìƒ‰ ì¡°ê±´ì— ë§žëŠ” ë§¤ë¬¼ì´ ì—†ìŠµë‹ˆë‹¤</p>
            <p className="text-sm text-gray-400 mt-1">í•„í„°ë¥¼ ë³€ê²½í•´ë³´ì„¸ìš”</p>
          </div>
        )}
      </div>
    </div>
  );
}
