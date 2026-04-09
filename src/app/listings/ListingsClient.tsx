'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Building2, SlidersHorizontal } from 'lucide-react';
import { sortWithPhotoPriority } from '@/lib/utils';

const dealTypes = ['전세', '월세', '매매'];
const listingTypes = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];

// V4-03: 정렬 옵션 확장 — 최신순 / 가격 낮은 순 / 가격 높은 순 / 면적 넓은 순
const sortOptions = [
  { value: 'latest', label: '최신순' },
  { value: 'price_asc', label: '가격 낮은 순' },
  { value: 'price_desc', label: '가격 높은 순' },
  { value: 'area_desc', label: '면적 넓은 순' },
];

// V4-03: sort 값에서 Supabase 쿼리용 컨피그 추출
const getSortConfig = (sort: string): { column: string; ascending: boolean } => {
  switch (sort) {
    case 'price_asc':  return { column: 'deposit', ascending: true };
    case 'price_desc': return { column: 'deposit', ascending: false };
    case 'area_desc':  return { column: 'area_m2', ascending: false };
    default:           return { column: 'created_at', ascending: false };
  }
};

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
  // S2: SSR 초기 데이터가 있으면 로딩 상태 건너뜀
  const [loading, setLoading] = useState(initialListings.length === 0 && totalCount === 0);
  const [page, setPage] = useState(1);
  const hasInitialData = useRef(initialListings.length > 0 || totalCount > 0);

  const deal = searchParams.get('deal') || '';
  const type = searchParams.get('type') || '';
  const dong = searchParams.get('dong') || '';
  const sort = searchParams.get('sort') || 'latest';
  const pageParam = searchParams.get('page') || '1';
  const pageSize = 12;

  // 데이터 로드 (필터 변경 시 클라이언트에서 재로드)
  useEffect(() => {
    const currentPage = parseInt(pageParam, 10) || 1;
    setPage(currentPage);

    // 첫 렌더링 시 SSR 데이터가 있으면 스킵
    if (hasInitialData.current) {
      hasInitialData.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();
      const offset = (currentPage - 1) * pageSize;

      // 매물 쿼리
      let query = supabase
        .from('listings')
        .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)')
        .eq('status', '가용');

      if (deal) query = query.eq('deal', deal);
      if (type) query = query.eq('type', type);
      if (dong) query = query.eq('dong', dong);

      // V4-03: 확장된 정렬 로직
      const { column: sortColumn, ascending: sortAsc } = getSortConfig(sort);
      query = query.order(sortColumn, { ascending: sortAsc });

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
      setListings(sortWithPhotoPriority(listingsResult.data || []));
      setDongs([...new Set((dongResult.data || []).map((r: any) => r.dong))].sort());
      setTotal(countResult.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [deal, type, dong, sort, pageParam]);

  // ── V4-05: 스크롤 위치 저장 / 복원 ──
  const scrollSaved = useRef(false);
  const isFirstRender = useRef(true);

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
      {/* 페이지 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumb items={[{ label: '매물 검색' }]} />
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-6">
          <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
          <p className="text-sm text-gray-500 mt-1">
            원하시는 지역의 매물을 검색하세요
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">필터</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <select
              value={deal}
              onChange={(e) => updateFilter('deal', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">거래유형 전체</option>
              {dealTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">매물유형 전체</option>
              {listingTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={dong}
              onChange={(e) => updateFilter('dong', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
            >
              <option value="">지역 전체</option>
              {dongs.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {/* V4-03: 확장된 정렬 드롭다운 */}
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

        {/* 결과 */}
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
              총 <strong className="text-wishes-primary">{total}</strong>건의 매물
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                {page > 1 && (
                  <a
                    href={`/listings?${new URLSearchParams({ ...(deal && { deal }), ...(type && { type }), ...(dong && { dong }), sort, page: String(page - 1) }).toString()}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    이전
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
                    다음
                  </a>
                )}
              </div>
            )}
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
