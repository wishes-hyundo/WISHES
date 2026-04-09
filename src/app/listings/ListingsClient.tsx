'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Building2, SlidersHorizontal, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';

const dealTypes = ['전세', '월세', '매매'];
const listingTypes = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];
const sortOptions = [
  { value: 'latest', label: '최신순' },
  { value: 'price', label: '가격순' },
  { value: 'area', label: '면적순' },
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
  const [loading, setLoading] = useState(initialListings.length === 0 && totalCount === 0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const hasInitialData = useRef(initialListings.length > 0 || totalCount > 0);

  const deal = searchParams.get('deal') || '';
  const type = searchParams.get('type') || '';
  const dong = searchParams.get('dong') || '';
  const sort = searchParams.get('sort') || 'latest';
  const search = searchParams.get('search') || '';
  const pageParam = searchParams.get('page') || '1';
  const pageSize = 12;

  // 매물번호 검색 처리
  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const trimmed = searchInput.trim();
    if (trimmed) {
      params.set('search', trimmed);
    }
    router.push(`/listings?${params.toString()}`);
  }, [router, searchInput]);

  // 검색 초기화
  const clearSearch = useCallback(() => {
    setSearchInput('');
    router.push('/listings');
  }, [router]);

  // URL의 search 파라미터 동기화
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // 데이터 로드 (필터 변경 시 - 사진 매물 우선 2단계 쿼리)
  useEffect(() => {
    const currentPage = parseInt(pageParam, 10) || 1;
    setPage(currentPage);

    if (hasInitialData.current) {
      hasInitialData.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();

      // 매물번호 검색 모드
      if (search) {
        const sId = parseInt(search.replace(/[Ww]-?/g, ''), 10);
        if (!isNaN(sId)) {
          const { data, count } = await supabase.from('listings').select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)', { count: 'exact' }).eq('id', sId);
          setListings(data || []);
          setTotal(count || 0);
        } else {
          const { data, count } = await supabase.from('listings').select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views, listing_images(url, sort_order)', { count: 'exact' }).eq('status', '가용').or('title.ilike.%' + search + '%,address.ilike.%' + search + '%,dong.ilike.%' + search + '%').order('created_at', { ascending: false }).range(0, pageSize - 1);
          setListings(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
        return;
      }

      const offset = (currentPage - 1) * pageSize;
      const selectFields = 'id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, views';
      const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';

      // Step 1: 사진 있는 매물 전체 조회
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

      // Step 3: 현재 페이지 매물
      let pageListings: any[] = [];

      if (offset < photoCount) {
        pageListings = photoListings.slice(offset, offset + pageSize);
        if (pageListings.length < pageSize) {
          const remaining = pageSize - pageListings.length;
          let npQ = supabase.from('listings').select(selectFields + ', listing_images(url, sort_order)').eq('status', '가용');
          if (deal) npQ = npQ.eq('deal', deal);
          if (type) npQ = npQ.eq('type', type);
          if (dong) npQ = npQ.eq('dong', dong);
          if (photoIds.length > 0) npQ = npQ.not('id', 'in', '(' + photoIds.join(',') + ')');
          npQ = npQ.order(sortColumn, { ascending: false }).limit(remaining);
          const npResult = await npQ;
          pageListings = [...pageListings, ...(npResult.data || [])];
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
        pageListings = npResult.data || [];
      }

      setListings(pageListings);
      setDongs([...new Set((dongResult.data || []).map((r: any) => r.dong))].sort());
      setTotal(countResult.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [deal, type, dong, sort, search, pageParam]);

  // 스크롤 위치 저장 / 복원
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
  }, [deal, type, dong, sort, search, pageParam]);

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    params.delete('search');
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams]);

  const goToPage = useCallback((p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/listings?${params.toString()}`);
  }, [router, searchParams]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (p >= 1 && p <= totalPages) {
      goToPage(p);
      setPageInput('');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // 페이지 번호 범위 계산
  const getPageNumbers = () => {
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxVisible + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

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
        {/* 매물번호 검색 */}
        <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">매물번호 / 키워드 검색</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="매물번호 (예: W-10819, 10819) 또는 주소/동 검색" className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30" />
            <button type="submit" className="px-5 py-2.5 bg-wishes-primary text-white rounded-lg text-sm font-medium hover:bg-wishes-primary/90 flex items-center gap-1.5"><Search className="w-4 h-4" />검색</button>
            {search && (<button type="button" onClick={clearSearch} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">초기화</button>)}
          </div>
        </form>

        {/* 필터 */}
        {!search && <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">필터</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <select value={deal} onChange={(e) => updateFilter('deal', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              <option value="">거래유형 전체</option>
              {dealTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select value={type} onChange={(e) => updateFilter('type', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              <option value="">매물유형 전체</option>
              {listingTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select value={dong} onChange={(e) => updateFilter('dong', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              <option value="">지역 전체</option>
              {dongs.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
            <select value={sort} onChange={(e) => updateFilter('sort', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              {sortOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
        </div>}



        {/* 검색 결과 안내 */}
        {search && !loading && (
          <div className="bg-wishes-secondary/5 border border-wishes-secondary/20 rounded-lg px-4 py-3 mb-4">
            <p className="text-sm text-wishes-primary"><strong>&quot;{search}&quot;</strong> 검색 결과: <strong>{total}</strong>건</p>
          </div>
        )}

        {/* 결과 */}
        {loading ? (
          <div>
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (<SkeletonCard key={i} />))}
            </div>
          </div>
        ) : listings.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {!search && <>총 <strong className="text-wishes-primary">{total.toLocaleString()}</strong>건의 매물</>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => (<ListingCard key={listing.id} listing={listing as any} />))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center gap-4 mt-10">
                <div className="flex items-center gap-1">
                  {/* 처음 */}
                  <button onClick={() => goToPage(1)} disabled={page === 1} className="p-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="처음">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  {/* 이전 */}
                  <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="p-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="이전">
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* 페이지 번호 */}
                  {getPageNumbers().map((p) => (
                    <button key={p} onClick={() => goToPage(p)} className={`px-3 py-2 rounded-lg text-sm min-w-[40px] ${p === page ? 'bg-wishes-primary text-white font-bold' : 'border border-gray-300 hover:bg-gray-50'}`}>
                      {p}
                    </button>
                  ))}

                  {/* 다음 */}
                  <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages} className="p-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="다음">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {/* 끝 */}
                  <button onClick={() => goToPage(totalPages)} disabled={page >= totalPages} className="p-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="끝">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                {/* 페이지 직접 입력 */}
                <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{page} / {totalPages} 페이지</span>
                  <span className="text-gray-300">|</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    placeholder="페이지 번호"
                    className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-wishes-primary text-white rounded-lg text-sm hover:bg-wishes-primary/90">
                    이동
                  </button>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{search ? `"${search}" 검색 결과가 없습니다` : '검색 조건에 맞는 매물이 없습니다'}</p>
            <p className="text-sm text-gray-400 mt-1">{search ? '매물번호나 키워드를 다시 확인해보세요' : '필터를 변경해보세요'}</p>
            {search && (<button onClick={clearSearch} className="mt-4 px-4 py-2 bg-wishes-primary text-white rounded-lg text-sm hover:bg-wishes-primary/90">전체 매물 보기</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
