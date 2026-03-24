'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { Listing, MapBounds, ListingFilter } from '@/types';

// ─── 가격 포맷 ────────────────────────────────────
function formatPrice(deal: string, deposit?: number, monthly?: number, price?: number) {
  const fmt = (p: number) => {
    const uk = Math.floor(p / 10000);
    const man = p % 10000;
    if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`;
    if (uk > 0) return `${uk}억`;
    return man.toLocaleString();
  };
  if (deal === '월세') return `${fmt(deposit || 0)}/${fmt(monthly || 0)}`;
  if (deal === '전세') return `전세 ${fmt(deposit || 0)}`;
  return fmt(price || deposit || 0);
}

// ─── 거래유형 배지 색상 ────────────────────────────
function dealColor(deal: string) {
  if (deal === '전세') return 'bg-blue-600';
  if (deal === '월세') return 'bg-orange-500';
  return 'bg-green-600';
}

// ─── 필터 옵션 정의 ────────────────────────────────
const DEAL_OPTIONS = ['전체', '전세', '월세', '매매'] as const;
const TYPE_OPTIONS = ['전체', '원룸', '투룸', '쓰리룸', '오피스텔', '상가', '사무실'] as const;
const DEPOSIT_OPTIONS = [
  { label: '전체', min: 0, max: 0 },
  { label: '1천만 이하', min: 0, max: 1000 },
  { label: '1천~3천', min: 1000, max: 3000 },
  { label: '3천~5천', min: 3000, max: 5000 },
  { label: '5천~1억', min: 5000, max: 10000 },
  { label: '1억~2억', min: 10000, max: 20000 },
  { label: '2억~3억', min: 20000, max: 30000 },
  { label: '3억 이상', min: 30000, max: 0 },
];
const MONTHLY_OPTIONS = [
  { label: '전체', min: 0, max: 0 },
  { label: '30만 이하', min: 0, max: 30 },
  { label: '30~50만', min: 30, max: 50 },
  { label: '50~70만', min: 50, max: 70 },
  { label: '70~100만', min: 70, max: 100 },
  { label: '100만 이상', min: 100, max: 0 },
];
const AREA_OPTIONS = [
  { label: '전체', min: 0, max: 0 },
  { label: '10㎡ 이하', min: 0, max: 10 },
  { label: '10~20㎡', min: 10, max: 20 },
  { label: '20~30㎡', min: 20, max: 30 },
  { label: '30~50㎡', min: 30, max: 50 },
  { label: '50㎡ 이상', min: 50, max: 0 },
];
const FEATURE_OPTIONS = [
  { key: 'parking', label: '주차' },
  { key: 'elevator', label: '엘리베이터' },
  { key: 'pet', label: '반려동물' },
  { key: 'full_option', label: '풀옵션' },
  { key: 'loan_available', label: '대출가능' },
] as const;

// ─── 필터 드롭다운 컴포넌트 ────────────────────────
function FilterButton({ label, active, isOpen, onClick }: {
  label: string; active: boolean; isOpen: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
        border transition-all whitespace-nowrap
        ${active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
        }
      `}
    >
      {label}
      <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

// ─── 드롭다운 패널 (라디오 선택) ────────────────────
function DropdownPanel({ options, selected, onSelect, onClose }: {
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 min-w-[180px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => { onSelect(opt.value); onClose(); }}
          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition flex items-center justify-between
            ${selected === opt.value ? 'text-blue-600 font-semibold' : 'text-gray-700'}
          `}
        >
          {opt.label}
          {selected === opt.value && (
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── 범위 드롭다운 패널 ─────────────────────────────
function RangeDropdownPanel({ options, selectedIdx, onSelect, onClose }: {
  options: { label: string; min: number; max: number }[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 min-w-[180px]">
      {options.map((opt, idx) => (
        <button
          key={idx}
          onClick={() => { onSelect(idx); onClose(); }}
          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition flex items-center justify-between
            ${selectedIdx === idx ? 'text-blue-600 font-semibold' : 'text-gray-700'}
          `}
        >
          {opt.label}
          {selectedIdx === idx && (
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── 체크박스 드롭다운 패널 ──────────────────────────
function CheckboxDropdownPanel({ options, selected, onToggle, onClose }: {
  options: { key: string; label: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 min-w-[180px]">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onToggle(opt.key)}
          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition flex items-center gap-3"
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition
            ${selected.has(opt.key) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}
          `}>
            {selected.has(opt.key) && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className={selected.has(opt.key) ? 'text-blue-600 font-medium' : 'text-gray-700'}>
            {opt.label}
          </span>
        </button>
      ))}
      <div className="px-4 pt-2 mt-1 border-t">
        <button
          onClick={onClose}
          className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          적용
        </button>
      </div>
    </div>
  );
}

// ─── 매물 카드 (지도 사이드패널용) ──────────────────
function MapListingCard({ listing }: { listing: Listing }) {
  const priceText = formatPrice(listing.deal, listing.deposit, listing.monthly, listing.price);
  return (
    <Link href={`/listings/${listing.id}`} className="block">
      <div className="flex gap-3 p-3 border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer">
        {/* 썸네일 */}
        <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 shrink-0">
          <div className={`absolute top-1.5 left-1.5 text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${dealColor(listing.deal)}`}>
            {listing.deal}
          </div>
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
        </div>
        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 truncate">{priceText}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{listing.title}</p>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
            {listing.area_m2 ? <span>{listing.area_m2}㎡</span> : null}
            {listing.floor_current ? (
              <>
                <span className="text-gray-200">·</span>
                <span>{listing.floor_current}층</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            {listing.dong && (
              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{listing.dong}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── 메인 페이냰 컴포넌트 ──────────────────────────
export default function MapPage() {
  // 필터 상태
  const [dealFilter, setDealFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [depositIdx, setDepositIdx] = useState(0);
  const [monthlyIdx, setMonthlyIdx] = useState(0);
  const [areaIdx, setAreaIdx] = useState(0);
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set());

  // 드롭다운 열림 상태
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // 지도/매물 상태
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<any[]>([]);
  const boundsRef = useRef<MapBounds | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-filter-group]')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // 카카오맵 초기화
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=38d5a390173f1fabc8857a69fd5a8f82&libraries=services,clusterer&autoload=false';
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      const checkKakao = setInterval(() => {
        if (window.kakao?.maps?.load) {
          clearInterval(checkKakao);
          window.kakao.maps.load(() => {
            if (!mapContainerRef.current) return;
            const map = new window.kakao.maps.Map(mapContainerRef.current, {
              center: new window.kakao.maps.LatLng(37.4833, 126.9283),
              level: 5,
            });
            mapRef.current = map;
            setMapReady(true);

            // 지도 이동/줌 시 매물 다시 조회
            window.kakao.maps.event.addListener(map, 'idle', () => {
              const b = map.getBounds();
              const sw = b.getSouthWest();
              const ne = b.getNorthEast();
              boundsRef.current = {
                swLat: sw.getLat(), swLng: sw.getLng(),
                neLat: ne.getLat(), neLng: ne.getLng(),
              };
              fetchListings();
            });

            // 초기 로드
            setTimeout(() => {
              const b = map.getBounds();
              const sw = b.getSouthWest();
              const ne = b.getNorthEast();
              boundsRef.current = {
                swLat: sw.getLat(), swLng: sw.getLng(),
                neLat: ne.getLat(), neLng: ne.getLng(),
              };
              fetchListings();
            }, 300);
          });
        }
      }, 200);

      setTimeout(() => clearInterval(checkKakao), 15000);
    };

    return () => { script.remove(); };
  }, []);

  // 필터 변경 시 재조회
  useEffect(() => {
    if (mapReady && boundsRef.current) {
      fetchListings();
    }
  }, [dealFilter, typeFilter, depositIdx, monthlyIdx, areaIdx, featureFilters, mapReady]);

  // 매물 조회 함수
  const fetchListings = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!boundsRef.current) return;
      setLoading(true);

      try {
        const params = new URLSearchParams({
          swLat: boundsRef.current.swLat.toString(),
          swLng: boundsRef.current.swLng.toString(),
          neLat: boundsRef.current.neLat.toString(),
          neLng: boundsRef.current.neLng.toString(),
        });

        if (dealFilter !== '전체') params.set('deal', dealFilter);
        if (typeFilter !== '전체') params.set('type', typeFilter);

        const depOpt = DEPOSIT_OPTIONS[depositIdx];
        if (depOpt.min > 0) params.set('minDeposit', depOpt.min.toString());
        if (depOpt.max > 0) params.set('maxDeposit', depOpt.max.toString());

        const res = await fetch(`/api/listings/map?${params}`);
        const data = await res.json();

        if (data.success) {
          let filtered = data.data || [];

          // 클라이언트 사이드 필터: 월세 범위
          if (monthlyIdx > 0 && dealFilter !== '매매' && dealFilter !== '전세') {
            const mOpt = MONTHLY_OPTIONS[monthlyIdx];
            filtered = filtered.filter((l: Listing) => {
              const m = l.monthly || 0;
              if (mOpt.min > 0 && m < mOpt.min) return false;
              if (mOpt.max > 0 && m > mOpt.max) return false;
              return true;
            });
          }

          // 클라이언트 사이드 필터: 면적 범위
          if (areaIdx > 0) {
            const aOpt = AREA_OPTIONS[areaIdx];
            filtered = filtered.filter((l: Listing) => {
              const a = l.area_m2 || 0;
              if (aOpt.min > 0 && a < aOpt.min) return false;
              if (aOpt.max > 0 && a > aOpt.max) return false;
              return true;
            });
          }

          // 클라이언트 사이드 필터: 특징
          if (featureFilters.size > 0) {
            filtered = filtered.filter((l: Listing) => {
              for (const key of featureFilters) {
                if (!(l as any)[key]) return false;
              }
              return true;
            });
          }

          setListings(filtered);
          setTotal(filtered.length);
          updateMarkers(filtered);
        }
      } catch (error) {
        console.error('매물 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [dealFilter, typeFilter, depositIdx, monthlyIdx, areaIdx, featureFilters]);

  // 마커 업데이트
  const updateMarkers = (items: Listing[]) => {
    // 기존 마커 제거
    markersRef.current.forEach(m => m.setMap(null));
    overlaysRef.current.forEach(o => o.setMap(null));
    markersRef.current = [];
    overlaysRef.current = [];

    if (!mapRef.current || !window.kakao?.maps) return;

    items.forEach(listing => {
      if (!listing.lat || !listing.lng) return;
      const position = new window.kakao.maps.LatLng(listing.lat, listing.lng);
      const priceText = formatPrice(listing.deal, listing.deposit, listing.monthly, listing.price);
      const bgColor = listing.deal === '전세' ? '#2563eb' : listing.deal === '월세' ? '#f97316' : '#16a34a';

      const content = document.createElement('div');
      content.innerHTML = `
        <div style="
          background: ${bgColor}; color: white; padding: 4px 10px; border-radius: 20px;
          font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 2px solid white;
        ">${priceText}</div>
      `;
      content.addEventListener('click', () => {
        window.open(`/listings/${listing.id}`, '_blank');
      });

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 1.3,
      });
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
  };

  // 필터 토글 핸들러
  const toggleDropdown = (name: string) => {
    setOpenDropdown(prev => prev === name ? null : name);
  };

  const toggleFeature = (key: string) => {
    setFeatureFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 필터 초기화
  const resetFilters = () => {
    setDealFilter('전체');
    setTypeFilter('전체');
    setDepositIdx(0);
    setMonthlyIdx(0);
    setAreaIdx(0);
    setFeatureFilters(new Set());
    setOpenDropdown(null);
  };

  const hasActiveFilter = dealFilter !== '전체' || typeFilter !== '전체' || depositIdx > 0 || monthlyIdx > 0 || areaIdx > 0 || featureFilters.size > 0;

  // 필터 라벨 생성
  const dealLabel = dealFilter === '전체' ? '거래유형' : dealFilter;
  const typeLabel = typeFilter === '전체' ? '매물유형' : typeFilter;
  const depositLabel = depositIdx === 0 ? '보증금' : DEPOSIT_OPTIONS[depositIdx].label;
  const monthlyLabel = monthlyIdx === 0 ? '월세' : MONTHLY_OPTIONS[monthlyIdx].label;
  const areaLabel = areaIdx === 0 ? '면적' : AREA_OPTIONS[areaIdx].label;
  const featureLabel = featureFilters.size === 0 ? '추가필터' : `추가필터 ${featureFilters.size}`;

  return (
    <div className="pt-16 h-screen flex flex-col bg-white">
      {/* ─── 필터 바 ─── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 z-30">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide" data-filter-group>
          {/* 거래유형 */}
          <div className="relative">
            <FilterButton
              label={dealLabel}
              active={dealFilter !== '전체'}
              isOpen={openDropdown === 'deal'}
              onClick={() => toggleDropdown('deal')}
            />
            {openDropdown === 'deal' && (
              <DropdownPanel
                options={DEAL_OPTIONS.map(d => ({ label: d, value: d }))}
                selected={dealFilter}
                onSelect={setDealFilter}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* 매물유형 */}
          <div className="relative">
            <FilterButton
              label={typeLabel}
              active={typeFilter !== '전체'}
              isOpen={openDropdown === 'type'}
              onClick={() => toggleDropdown('type')}
            />
            {openDropdown === 'type' && (
              <DropdownPanel
                options={TYPE_OPTIONS.map(t => ({ label: t, value: t }))}
                selected={typeFilter}
                onSelect={setTypeFilter}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* 보증금 */}
          <div className="relative">
            <FilterButton
              label={depositLabel}
              active={depositIdx > 0}
              isOpen={openDropdown === 'deposit'}
              onClick={() => toggleDropdown('deposit')}
            />
            {openDropdown === 'deposit' && (
              <RangeDropdownPanel
                options={DEPOSIT_OPTIONS}
                selectedIdx={depositIdx}
                onSelect={setDepositIdx}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* 월세 */}
          {dealFilter !== '매매' && dealFilter !== '전세' && (
            <div className="relative">
              <FilterButton
                label={monthlyLabel}
                active={monthlyIdx > 0}
                isOpen={openDropdown === 'monthly'}
                onClick={() => toggleDropdown('monthly')}
              />
              {openDropdown === 'monthly' && (
                <RangeDropdownPanel
                  options={MONTHLY_OPTIONS}
                  selectedIdx={monthlyIdx}
                  onSelect={setMonthlyIdx}
                  onClose={() => setOpenDropdown(null)}
                />
              )}
            </div>
          )}

          {/* 면적 */}
          <div className="relative">
            <FilterButton
              label={areaLabel}
              active={areaIdx > 0}
              isOpen={openDropdown === 'area'}
              onClick={() => toggleDropdown('area')}
            />
            {openDropdown === 'area' && (
              <RangeDropdownPanel
                options={AREA_OPTIONS}
                selectedIdx={areaIdx}
                onSelect={setAreaIdx}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* 추가필터 */}
          <div className="relative">
            <FilterButton
              label={featureLabel}
              active={featureFilters.size > 0}
              isOpen={openDropdown === 'features'}
              onClick={() => toggleDropdown('features')}
            />
            {openDropdown === 'features' && (
              <CheckboxDropdownPanel
                options={[...FEATURE_OPTIONS]}
                selected={featureFilters}
                onToggle={toggleFeature}
                onClose={() => setOpenDropdown(null)}
              />
            )}
          </div>

          {/* 구분선 + 초기화 */}
          {hasActiveFilter && (
            <>
              <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-red-500 hover:text-red-600 font-medium whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                초기화
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── 메인 컨텐츠: 목록 + 지도 ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 매물 목록 패널 */}
        <div className="w-[380px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
          {/* 매물 수 헤더 */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">매물</span>
              <span className="text-sm font-bold text-blue-600">{total}건</span>
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                검색 중
              </div>
            )}
          </div>

          {/* 매물 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {listings.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm">이 영역에 매물이 없습니다</p>
                <p className="text-xs mt-1">지도를 이동하거나 필터를 변경해보세요</p>
              </div>
            ) : (
              listings.map((listing) => (
                <MapListingCard key={listing.id} listing={listing} />
              ))
            )}
          </div>
        </div>

        {/* 우측 지도 */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* 현재 위치 버튼 */}
          <button
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setCenter(new window.kakao.maps.LatLng(37.4833, 126.9283));
                mapRef.current.setLevel(5);
              }
            }}
            className="absolute bottom-6 right-6 bg-white w-10 h-10 rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition z-10"
            title="기본 위치로 이동"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
