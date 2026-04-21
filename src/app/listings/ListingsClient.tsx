'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { applyImagePolicy } from '@/lib/image-policy';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Building2, SlidersHorizontal, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Search, X as XIcon, Clock, Coins, Maximize2, Bookmark, BookmarkCheck, Filter, ChevronDown, Bell } from 'lucide-react';
import { useSavedSearch } from '@/contexts/SavedSearchContext';
// T5-7: 신규 매물 알림 구독 모달
import AlertSubscribeModal from '@/components/AlertSubscribeModal';

const dealTypes = ['전세', '월세', '매매'];
const listingTypes = [
  '원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라',
  '주택', '상가', '사무실', '지식산업센터', '토지'
];
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
  const { addSearch, removeSearch, searches, isSaved } = useSavedSearch();

  const [listings, setListings] = useState<any[]>(initialListings);
  const [dongs, setDongs] = useState<string[]>(initialDongs);
  const [total, setTotal] = useState(totalCount);
  const [loading, setLoading] = useState(initialListings.length === 0 && totalCount === 0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // 모바일 전용 필터 접힘 상태 (데스크탑에서는 항상 열림)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const hasInitialData = useRef(initialListings.length > 0 || totalCount > 0);

  // T5-7: 알림 구독 모달
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const deal = searchParams.get('deal') || '';
  const type = searchParams.get('type') || '';
  const dong = searchParams.get('dong') || '';
  const sort = searchParams.get('sort') || 'latest';
  const search = searchParams.get('search') || '';
  const maxDeposit = searchParams.get('maxDeposit') || '';
  const minArea = searchParams.get('minArea') || '';
  // T2-2: 상가 특화 필터 (업종 · 권리금)
  const businessType = searchParams.get('businessType') || '';
  const maxRightsFee = searchParams.get('maxRightsFee') || '';
  // T2-4: 컨디션 아이콘 필터 (풀옵션 · 반려 · 여성안심 대체 · 주차 · 엘리베이터)
  //   — 카드 UI: pet, full_option, parking, elevator, balcony (0또는 1)
  const cond = searchParams.get('cond') || ''; // 콤마 구분 키워드: "pet,fullOption,parking,elevator,balcony"
  const condSet = new Set(cond.split(',').filter(Boolean));
  const pageParam = searchParams.get('page') || '1';
  const pageSize = 12;

  // 프리셋 가격대(보증금 기준, 만원 단위) — 거래유형별 세분화
  const pricePresets: { label: string; max: string }[] = deal === '매매'
    ? [
        { label: '5억 이하', max: '50000' },
        { label: '10억 이하', max: '100000' },
        { label: '20억 이하', max: '200000' },
        { label: '전체', max: '' },
      ]
    : deal === '월세'
    ? [
        { label: '500 이하', max: '500' },
        { label: '1,000 이하', max: '1000' },
        { label: '3,000 이하', max: '3000' },
        { label: '전체', max: '' },
      ]
    : deal === '전세'
    ? [
        { label: '1억 이하', max: '10000' },
        { label: '3억 이하', max: '30000' },
        { label: '5억 이하', max: '50000' },
        { label: '전체', max: '' },
      ]
    : [];

  // 면적 프리셋 (㎡)
  const areaPresets: { label: string; min: string }[] = [
    { label: '10㎡↑', min: '10' },
    { label: '20㎡↑', min: '20' },
    { label: '40㎡↑', min: '40' },
    { label: '60㎡↑', min: '60' },
    { label: '전체', min: '' },
  ];

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

      // ※ 저작권 보호 + 자체 업로드 통과
      //   - 크롤링 매물의 외부 원본 이미지는 차단
      //   - 중개사가 직접 올린 자체 업로드 이미지는 통과 (광고 노출)
      const stripCrawledImages = (arr: any[]) => arr.map((r: any) => applyImagePolicy(r));

      // L6 (2026-04-21): SSR(page.tsx) 의 M4 교정 슬림 SELECT 와 동일 필드 세트로
      //   정렬. displayTitle(ai_title/title/building_name/station_*/rooms/...) 과
      //   formatFloor(floor_current/floor_total) + collectHooks(built_year/direction/
      //   features/description/balcony) 를 모두 커버. 필터 변경 시 재페치 결과가
      //   SSR 초기 페이로드와 동일한 카드 품질을 내도록 함.
      const selectFields =
        'id, deal, type, dong, ' +
        'deposit, monthly, price, ' +
        'area_m2, area_pyeong, ' +
        'floor_current, floor_total, ' +
        'parking, elevator, full_option, pet, balcony, ' +
        'built_year, direction, ' +
        'ai_title, title, building_name, ' +
        'rooms, station_name, station_distance, ' +
        'features, description, ' +
        'source_site, created_at';

      // 매물번호 검색 모드
      if (search) {
        const sId = parseInt(search.replace(/[Ww]-?/g, ''), 10);
        if (!isNaN(sId)) {
          const { data, count } = await supabase
            .from('listings')
            .select(selectFields + ', listing_images(url, sort_order)', { count: 'exact' })
            .eq('id', sId);
          setListings(stripCrawledImages(data || []));
          setTotal(count || 0);
        } else {
          const { data, count } = await supabase
            .from('listings')
            .select(selectFields + ', listing_images(url, sort_order)', { count: 'exact' })
            .eq('status', '공개')
            .or('title.ilike.%' + search + '%,address.ilike.%' + search + '%,dong.ilike.%' + search + '%')
            .order('created_at', { ascending: false })
            .range(0, pageSize - 1);
          setListings(stripCrawledImages(data || []));
          setTotal(count || 0);
        }
        setLoading(false);
        return;
      }

      const offset = (currentPage - 1) * pageSize;
      const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';

      // Step 1: 사진 있는 자체 매물 전체 조회 (크롤링 매물은 사진이 차단되므로 photo-first 로직에서 제외)
      let photoQuery = supabase
        .from('listings')
        .select(selectFields + ', listing_images!inner(url, sort_order)')
        .eq('status', '공개')
        .is('source_site', null);
      if (deal) photoQuery = photoQuery.eq('deal', deal);
      if (type) photoQuery = photoQuery.eq('type', type);
      if (dong) photoQuery = photoQuery.eq('dong', dong);
      if (maxDeposit) {
        const md = parseInt(maxDeposit, 10);
        if (deal === '매매') photoQuery = photoQuery.lte('price', md);
        else if (deal === '월세') photoQuery = photoQuery.lte('monthly', md);
        else photoQuery = photoQuery.lte('deposit', md);
      }
      if (minArea) photoQuery = photoQuery.gte('area_m2', parseInt(minArea, 10));
      // T2-2 상가 특화
      if (businessType) photoQuery = photoQuery.ilike('business_type', '%' + businessType + '%');
      if (maxRightsFee) photoQuery = photoQuery.lte('rights_fee', parseInt(maxRightsFee, 10));
      // T2-4 컨디션 플래그
      if (condSet.has('pet')) photoQuery = photoQuery.eq('pet', true);
      if (condSet.has('fullOption')) photoQuery = photoQuery.eq('full_option', true);
      if (condSet.has('parking')) photoQuery = photoQuery.eq('parking', true);
      if (condSet.has('elevator')) photoQuery = photoQuery.eq('elevator', true);
      if (condSet.has('balcony')) photoQuery = photoQuery.eq('balcony', true);
      photoQuery = photoQuery.order(sortColumn, { ascending: false }).limit(500);

      // Step 2: 동 목록 + 전체 개수 (크롤링 포함 — 정보는 광고 노출)
      const dongQuery = supabase.from('listings').select('dong').eq('status', '공개');
      let countQuery = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '공개');
      if (deal) countQuery = countQuery.eq('deal', deal);
      if (type) countQuery = countQuery.eq('type', type);
      if (dong) countQuery = countQuery.eq('dong', dong);
      if (maxDeposit) {
        const md = parseInt(maxDeposit, 10);
        if (deal === '매매') countQuery = countQuery.lte('price', md);
        else if (deal === '월세') countQuery = countQuery.lte('monthly', md);
        else countQuery = countQuery.lte('deposit', md);
      }
      if (minArea) countQuery = countQuery.gte('area_m2', parseInt(minArea, 10));
      if (businessType) countQuery = countQuery.ilike('business_type', '%' + businessType + '%');
      if (maxRightsFee) countQuery = countQuery.lte('rights_fee', parseInt(maxRightsFee, 10));
      if (condSet.has('pet')) countQuery = countQuery.eq('pet', true);
      if (condSet.has('fullOption')) countQuery = countQuery.eq('full_option', true);
      if (condSet.has('parking')) countQuery = countQuery.eq('parking', true);
      if (condSet.has('elevator')) countQuery = countQuery.eq('elevator', true);
      if (condSet.has('balcony')) countQuery = countQuery.eq('balcony', true);

      const [photoResult, dongResult, countResult] = await Promise.all([photoQuery, dongQuery, countQuery]);

      const photoListings = photoResult.data || [];
      const photoIds = photoListings.map((l: any) => l.id);
      const photoCount = photoListings.length;

      // Step 3: 현재 페이지 매물 (크롤링 포함, 사진만 나중에 제거)
      let pageListings: any[] = [];

      const applyNpFilters = (q: any) => {
        if (deal) q = q.eq('deal', deal);
        if (type) q = q.eq('type', type);
        if (dong) q = q.eq('dong', dong);
        if (maxDeposit) {
          const md = parseInt(maxDeposit, 10);
          if (deal === '매매') q = q.lte('price', md);
          else if (deal === '월세') q = q.lte('monthly', md);
          else q = q.lte('deposit', md);
        }
        if (minArea) q = q.gte('area_m2', parseInt(minArea, 10));
        return q;
      };

      if (offset < photoCount) {
        pageListings = photoListings.slice(offset, offset + pageSize);
        if (pageListings.length < pageSize) {
          const remaining = pageSize - pageListings.length;
          let npQ: any = supabase.from('listings').select(selectFields + ', listing_images(url, sort_order)').eq('status', '공개');
          npQ = applyNpFilters(npQ);
          if (photoIds.length > 0) npQ = npQ.not('id', 'in', '(' + photoIds.join(',') + ')');
          npQ = npQ.order(sortColumn, { ascending: false }).limit(remaining);
          const npResult = await npQ;
          pageListings = [...pageListings, ...(npResult.data || [])];
        }
      } else {
        const adjustedOffset = offset - photoCount;
        let npQ: any = supabase.from('listings').select(selectFields + ', listing_images(url, sort_order)').eq('status', '공개');
        npQ = applyNpFilters(npQ);
        if (photoIds.length > 0) npQ = npQ.not('id', 'in', '(' + photoIds.join(',') + ')');
        npQ = npQ.order(sortColumn, { ascending: false }).range(adjustedOffset, adjustedOffset + pageSize - 1);
        const npResult = await npQ;
        pageListings = npResult.data || [];
      }

      setListings(stripCrawledImages(pageListings));
      setDongs([...new Set((dongResult.data || []).map((r: any) => r.dong))].sort());
      setTotal(countResult.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [deal, type, dong, sort, search, pageParam, maxDeposit, minArea, businessType, maxRightsFee, cond]);

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
  }, [deal, type, dong, sort, search, pageParam, maxDeposit, minArea, businessType, maxRightsFee, cond]);

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

  // ━━━ 활성 필터 칩 라벨 ━━━
  const sortLabel = sortOptions.find((o) => o.value === sort)?.label || '최신순';
  const priceChipLabel = (() => {
    if (!maxDeposit) return '';
    const md = parseInt(maxDeposit, 10);
    if (deal === '매매') return md >= 10000 ? `${Math.floor(md / 10000)}억 이하` : `${md.toLocaleString()} 이하`;
    if (deal === '월세') return `월 ${md.toLocaleString()}만 이하`;
    return md >= 10000 ? `${Math.floor(md / 10000)}억 이하` : `${md.toLocaleString()} 이하`;
  })();
  const activeChips: { key: string; label: string; icon?: React.ReactNode }[] = [];
  if (deal) activeChips.push({ key: 'deal', label: deal });
  if (type) activeChips.push({ key: 'type', label: type });
  if (dong) activeChips.push({ key: 'dong', label: dong });
  if (maxDeposit && priceChipLabel) activeChips.push({ key: 'maxDeposit', label: priceChipLabel, icon: <Coins className="w-3 h-3" /> });
  if (minArea) activeChips.push({ key: 'minArea', label: `${minArea}㎡↑`, icon: <Maximize2 className="w-3 h-3" /> });
  if (businessType) activeChips.push({ key: 'businessType', label: '업종 "' + businessType + '"' });
  if (maxRightsFee !== '') {
    const rfLabel = maxRightsFee === '0' ? '권리금 없음' : `권리금 ${parseInt(maxRightsFee).toLocaleString()}만 이하`;
    activeChips.push({ key: 'maxRightsFee', label: rfLabel });
  }
  const condLabels: Record<string, string> = { fullOption: '풀옵션', pet: '반려', parking: '주차', elevator: '엘리베이터', balcony: '발코니' };
  Array.from(condSet).forEach((k) => {
    activeChips.push({ key: 'cond:' + k, label: condLabels[k] || k });
  });

  // ━━━ 저장 검색 처리 ━━━
  // 현재 URL 쿼리에서 조건 필터만 추출 (페이지/정렬은 제외해서 조건 자체가 "의미 같은" 저장인지 비교)
  const currentQueryForSave: Record<string, string> = {};
  if (deal) currentQueryForSave.deal = deal;
  if (type) currentQueryForSave.type = type;
  if (dong) currentQueryForSave.dong = dong;
  if (maxDeposit) currentQueryForSave.maxDeposit = maxDeposit;
  if (minArea) currentQueryForSave.minArea = minArea;
  if (search) currentQueryForSave.search = search;
  const hasAnyFilter = Object.keys(currentQueryForSave).length > 0;
  const currentlySaved = hasAnyFilter && isSaved(currentQueryForSave);
  const saveLabel = (() => {
    const parts: string[] = [];
    if (dong) parts.push(dong);
    if (deal) parts.push(deal);
    if (type) parts.push(type);
    if (priceChipLabel) parts.push(priceChipLabel);
    if (minArea) parts.push(`${minArea}㎡↑`);
    if (search) parts.push(`"${search}"`);
    return parts.length > 0 ? parts.join(' · ') : '조건 없음';
  })();
  const handleSaveSearch = () => {
    if (!hasAnyFilter) return;
    if (currentlySaved) {
      const target = searches.find((s) => JSON.stringify(s.query) === JSON.stringify(Object.fromEntries(Object.entries(currentQueryForSave).sort())));
      if (target) removeSearch(target.id);
    } else {
      addSearch(saveLabel, currentQueryForSave);
    }
  };

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

      <div className="max-w-7xl mx-auto px-4 py-6 lg:grid lg:grid-cols-[300px_1fr] lg:gap-6">
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━
            좌측 사이드 필터 (데스크탑) / 상단 드로어 (모바일)
           ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1 space-y-4 lg:space-y-4 mb-4 lg:mb-0">

        {/* 모바일 필터 토글 (lg 미만 전용) */}
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className="lg:hidden w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 text-sm font-semibold text-wishes-primary"
        >
          <span className="inline-flex items-center gap-2"><Filter className="w-4 h-4" /> 검색 · 필터</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 필터 콘텐츠 래퍼 — 모바일 접힘 제어 */}
        <div className={`${mobileFiltersOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
        {/* 매물번호 검색 */}
        <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-4">
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">필터</span>
            </div>
            <div className="flex items-center gap-3">
              {hasAnyFilter && (
                <button
                  onClick={handleSaveSearch}
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    currentlySaved
                      ? 'bg-wishes-primary text-white border-wishes-primary'
                      : 'bg-white text-wishes-primary border-wishes-primary/30 hover:bg-wishes-primary/5'
                  }`}
                  title={currentlySaved ? '저장됨 — 클릭하여 해제' : '이 조건을 내 검색에 저장'}
                >
                  {currentlySaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                  {currentlySaved ? '저장됨' : '이 조건 저장'}
                </button>
              )}
              {(deal || type || dong || maxDeposit || minArea) && (
                <button
                  onClick={() => router.push('/listings')}
                  className="text-xs text-gray-500 hover:text-wishes-primary underline-offset-2 hover:underline"
                >
                  필터 초기화
                </button>
              )}
            </div>
          </div>
          {/* L-a11y4 (2026-04-21): select-name axe 실패 해소. aria-label 로 accessible name 확보. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <select aria-label="거래유형 선택" value={deal} onChange={(e) => updateFilter('deal', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              <option value="">거래유형 전체</option>
              {dealTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select aria-label="매물유형 선택" value={type} onChange={(e) => updateFilter('type', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30">
              <option value="">매물유형 전체</option>
              {listingTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select aria-label="지역(동) 선택" value={dong} onChange={(e) => updateFilter('dong', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 col-span-2 sm:col-span-2">
              <option value="">지역 전체</option>
              {dongs.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>

          {/* ━━━ 정렬 (pill tabs) ━━━ */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1 mr-1">
              <Clock className="w-3 h-3" /> 정렬
            </span>
            {sortOptions.map((o) => {
              const active = sort === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => updateFilter('sort', o.value)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all ' +
                    (active
                      ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary')
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* ━━━ 가격대 프리셋 (거래유형 선택 시 노출) ━━━ */}
          {deal && pricePresets.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {deal === '매매' ? '매매가' : deal === '월세' ? '월세' : '보증금'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pricePresets.map((p) => {
                  const active = maxDeposit === p.max;
                  return (
                    <button
                      key={p.label}
                      onClick={() => updateFilter('maxDeposit', p.max)}
                      className={
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all ' +
                        (active
                          ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary')
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ━━━ 면적 프리셋 ━━━ */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">전용면적</p>
            <div className="flex flex-wrap gap-1.5">
              {areaPresets.map((p) => {
                const active = minArea === p.min;
                return (
                  <button
                    key={p.label}
                    onClick={() => updateFilter('minArea', p.min)}
                    className={
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all ' +
                      (active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary')
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ━━━ T2-2: 상가 특화 필터 (업종 · 권리금) — 매물유형 = 상가 / 사무실일 때만 노출 ━━━ */}
          {(type === '상가' || type === '사무실') && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">업종 / 권리금</p>
                <span className="text-[10px] text-wishes-muted">{type} 전용</span>
              </div>
              <input
                type="text"
                value={businessType}
                onChange={(e) => updateFilter('businessType', e.target.value)}
                placeholder="업종 키워드 (예: 카페, 음식점, 사무)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 mb-2"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '권리금 없음', max: '0' },
                  { label: '1천만원 이하', max: '1000' },
                  { label: '3천만원 이하', max: '3000' },
                  { label: '5천만원 이하', max: '5000' },
                  { label: '전체', max: '' },
                ].map((p) => {
                  const active = maxRightsFee === p.max;
                  return (
                    <button
                      key={p.label}
                      onClick={() => updateFilter('maxRightsFee', p.max)}
                      className={
                        'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ' +
                        (active
                          ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary')
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ━━━ T2-4: 컨디션 아이콘 필터 ━━━ */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">컨디션</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: 'fullOption', icon: '🛋️', label: '풀옵션' },
                { key: 'pet', icon: '🐾', label: '반려동물' },
                { key: 'parking', icon: '🅿️', label: '주차 가능' },
                { key: 'elevator', icon: '🛗', label: '엘리베이터' },
                { key: 'balcony', icon: '🌿', label: '발코니' },
              ].map((c) => {
                const active = condSet.has(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => {
                      const next = new Set(condSet);
                      if (active) next.delete(c.key); else next.add(c.key);
                      updateFilter('cond', Array.from(next).join(','));
                    }}
                    className={
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ' +
                      (active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary')
                    }
                  >
                    <span className="text-sm leading-none">{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>}

        </div>{/* /필터 콘텐츠 래퍼 */}
        </aside>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ 우측 결과 영역 ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="min-w-0">

        {/* ━━━ 활성 필터 칩 (선택된 필터 한눈에 + 개별 제거) ━━━ */}
        {!search && activeChips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> 적용된 필터
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => {
                  // cond:* chips → remove individual key from cond set
                  if (chip.key.startsWith('cond:')) {
                    const target = chip.key.slice(5);
                    const next = new Set(condSet);
                    next.delete(target);
                    updateFilter('cond', Array.from(next).join(','));
                  } else {
                    updateFilter(chip.key, '');
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-wishes-primary/10 text-wishes-primary border border-wishes-primary/20 rounded-full hover:bg-wishes-primary hover:text-white transition-all"
                title={`${chip.label} 필터 해제`}
              >
                {chip.icon}
                <span>{chip.label}</span>
                <XIcon className="w-3 h-3 opacity-70" />
              </button>
            ))}
            <button
              onClick={() => router.push('/listings')}
              className="text-xs text-gray-500 hover:text-wishes-primary underline-offset-2 hover:underline ml-1"
            >
              전체 초기화
            </button>
          </div>
        )}

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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-sm text-gray-500">
                {!search && (
                  <>
                    총 <strong className="text-wishes-primary text-base">{total.toLocaleString()}</strong>건
                    {totalPages > 1 && (
                      /* L-a11y4 (2026-04-21): text-gray-400 → text-gray-600 (2.38:1 → 5.72:1 AA 통과) */
                      <span className="text-gray-600 ml-2">
                        · <strong className="text-gray-700">{page}</strong> / {totalPages} 페이지
                      </span>
                    )}
                  </>
                )}
              </p>
              <div className="flex items-center gap-3">
                {/* T5-7: 이 조건으로 알림 받기 */}
                <button
                  type="button"
                  onClick={() => setSubscribeOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wishes-primary/[0.08] hover:bg-wishes-primary/15 border border-wishes-primary/30 text-xs font-bold text-wishes-primary transition-colors"
                  title="이 조건에 맞는 신규 매물이 등록되면 이메일로 알려드립니다"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">이 조건으로 알림 받기</span>
                  <span className="sm:hidden">알림</span>
                </button>
                {/* L-a11y4 (2026-04-21): text-gray-400 → text-gray-600 (AA 통과) */}
                <p className="text-xs text-gray-600 hidden sm:block">정렬: <span className="text-gray-700 font-medium">{sortLabel}</span></p>
              </div>
            </div>
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
                  {/* L-a11y4 (2026-04-21): 장식용 구분자 → aria-hidden */}
                  <span className="text-gray-300" aria-hidden="true">|</span>
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
            <p className="text-sm text-gray-400 mt-1">
              {search
                ? '매물번호나 키워드를 다시 확인하시거나, 필터를 해제해 보세요.'
                : (deal || type || dong || maxDeposit || minArea)
                  ? '필터 조건을 완화하거나 초기화 후 다시 검색해 주세요.'
                  : '현재 등록된 매물이 없습니다. 잠시 후 다시 확인해 주세요.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {search && (
                <button onClick={clearSearch} className="px-4 py-2 bg-wishes-primary text-white rounded-lg text-sm hover:bg-wishes-primary/90">
                  전체 매물 보기
                </button>
              )}
              {(deal || type || dong || maxDeposit || minArea) && (
                <button
                  onClick={() => router.push('/listings')}
                  className="px-4 py-2 bg-white border-2 border-wishes-primary text-wishes-primary rounded-lg text-sm font-semibold hover:bg-wishes-primary/5"
                >
                  필터 초기화
                </button>
              )}
              <button
                onClick={() => router.push('/map')}
                className="px-4 py-2 bg-wishes-secondary text-white rounded-lg text-sm hover:bg-wishes-secondary/90"
              >
                지도에서 찾기
              </button>
            </div>
          </div>
        )}
        </div>{/* /우측 결과 영역 */}
      </div>

      {/* T5-7: 매물 알림 구독 모달 */}
      <AlertSubscribeModal
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        source="/listings"
        filters={{
          deal: deal || null,
          type: type || null,
          dong: dong || null,
          max_deposit: maxDeposit ? Number(maxDeposit) : null,
          min_area_m2: minArea ? Number(minArea) : null,
        }}
      />
    </div>
  );
}
