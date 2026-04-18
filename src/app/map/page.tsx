'use client';

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import MapListingPanel from '@/components/MapListingPanel';
import { formatPrice } from '@/lib/utils';
import { MapPin, List, Loader2, Search, X, Building2, Crosshair, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';
import MapFilterSheet from '@/components/MapFilterSheet';
import { useRouter, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    kakao: any;
  }
}

const dealTypes: DealType[] = ['매매', '전세', '월세', '단기'];
const listingTypes: ListingType[] = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라', '상가', '사무실'];

// 층수 범주 판정
function floorMatches(floor: number | null | undefined, category?: string): boolean {
  if (!category) return true;
  if (floor == null) return false;
  switch (category) {
    case 'basement': return floor < 0;
    case 'low':      return floor >= 1 && floor <= 3;
    case 'mid':      return floor >= 4 && floor <= 7;
    case 'high':     return floor >= 8;
    default:         return true;
  }
}

// URL 쿼리 ↔ 필터 직렬화
function filterToQuery(f: ListingFilter): string {
  const p = new URLSearchParams();
  if (f.deals?.length) p.set('deals', f.deals.join(','));
  if (f.types?.length) p.set('types', f.types.join(','));
  if (f.minDeposit) p.set('minDeposit', String(f.minDeposit));
  if (f.maxDeposit) p.set('maxDeposit', String(f.maxDeposit));
  if (f.minMonthly) p.set('minMonthly', String(f.minMonthly));
  if (f.maxMonthly) p.set('maxMonthly', String(f.maxMonthly));
  if (f.minArea) p.set('minArea', String(f.minArea));
  if (f.maxArea) p.set('maxArea', String(f.maxArea));
  if (f.floorCategory) p.set('floor', f.floorCategory);
  if (f.direction) p.set('direction', f.direction);
  if (f.moveIn) p.set('moveIn', f.moveIn);
  if (f.moveInDate) p.set('moveInDate', f.moveInDate);
  if (f.businessUseable) p.set('biz', '1');
  if (f.goodwillFreeOnly) p.set('gwFree', '1');
  if (f.options) {
    const opts: string[] = [];
    if (f.options.fullOption) opts.push('full');
    if (f.options.pet) opts.push('pet');
    if (f.options.parking) opts.push('parking');
    if (f.options.elevator) opts.push('elevator');
    if (f.options.balcony) opts.push('balcony');
    if (f.options.newBuild) opts.push('new');
    if (opts.length) p.set('options', opts.join(','));
  }
  return p.toString();
}

function queryToFilter(sp: URLSearchParams): ListingFilter {
  const f: ListingFilter = {};
  const deals = sp.get('deals');
  if (deals) f.deals = deals.split(',').filter(Boolean) as DealType[];
  const types = sp.get('types');
  if (types) f.types = types.split(',').filter(Boolean) as ListingType[];
  const n = (k: string) => {
    const v = sp.get(k);
    return v ? Number(v) : undefined;
  };
  f.minDeposit = n('minDeposit');
  f.maxDeposit = n('maxDeposit');
  f.minMonthly = n('minMonthly');
  f.maxMonthly = n('maxMonthly');
  f.minArea = n('minArea');
  f.maxArea = n('maxArea');
  const floor = sp.get('floor');
  if (floor) f.floorCategory = floor as any;
  const dir = sp.get('direction');
  if (dir) f.direction = dir;
  const mi = sp.get('moveIn');
  if (mi) f.moveIn = mi as any;
  const mid = sp.get('moveInDate');
  if (mid) f.moveInDate = mid;
  if (sp.get('biz') === '1') f.businessUseable = true;
  if (sp.get('gwFree') === '1') f.goodwillFreeOnly = true;
  const opts = sp.get('options');
  if (opts) {
    const arr = opts.split(',');
    f.options = {
      fullOption: arr.includes('full'),
      pet: arr.includes('pet'),
      parking: arr.includes('parking'),
      elevator: arr.includes('elevator'),
      balcony: arr.includes('balcony'),
      newBuild: arr.includes('new'),
    };
  }
  return f;
}

const DEFAULT_CENTER = { lat: 37.4847, lng: 126.9293 };
const DEFAULT_ZOOM = 7; // 구/군 단위 — 초기 로드 시 넓은 범위 매물 노출 (카카오맵: 숫자↑ = 축소)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 주소 파싱 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractCity(address: string): string {
  if (!address) return '기타';
  const parts = address.trim().split(/\s+/);
  if (parts[0]?.includes('서울')) return '서울';
  if (parts[0]?.includes('인천')) return '인천';
  if (parts[0]?.includes('부산')) return '부산';
  if (parts[0]?.includes('대구')) return '대구';
  if (parts[0]?.includes('대전')) return '대전';
  if (parts[0]?.includes('광주')) return '광주';
  if (parts[0]?.includes('울산')) return '울산';
  if (parts[0]?.includes('세종')) return '세종';
  if (parts[0]?.includes('경기')) {
    // 경기도 XX시 → "XX시"
    if (parts[1]) return parts[1].replace(/시$/, '') + '시';
    return '경기';
  }
  return parts[0]?.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '') || '기타';
}

function extractGu(address: string): string {
  if (!address) return '기타';
  const parts = address.trim().split(/\s+/);
  for (const part of parts) {
    if (part.endsWith('구') || part.endsWith('군')) return part;
  }
  return parts[1] || '기타';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시/도 클러스터 마커 (Level 9+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createCityClusterContent(cityName: string, count: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    cursor: pointer; transform: translate(-50%, -50%);
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  `;

  const circle = document.createElement('div');
  const size = count >= 50 ? 68 : count >= 20 ? 60 : 52;
  circle.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #1b5e20 100%);
    color: #fff; font-size: ${count >= 100 ? '16px' : '18px'}; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(99,102,241,0.5), 0 0 0 4px rgba(255,255,255,0.95);
    font-family: 'GmarketSans', sans-serif;
    letter-spacing: -0.5px;
  `;
  circle.textContent = String(count);

  const label = document.createElement('div');
  label.style.cssText = `
    background: rgba(255,255,255,0.98); color: #312e81;
    font-size: 14px; font-weight: 700; padding: 5px 16px;
    border-radius: 16px; white-space: nowrap;
    box-shadow: 0 2px 10px rgba(0,0,0,0.12);
    border: 1.5px solid rgba(99,102,241,0.15);
    font-family: 'GmarketSans', sans-serif;
  `;
  label.textContent = cityName;

  wrapper.appendChild(circle);
  wrapper.appendChild(label);

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1.12)';
    circle.style.boxShadow = '0 6px 20px rgba(99,102,241,0.6), 0 0 0 4px rgba(255,255,255,1)';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
    circle.style.boxShadow = '0 4px 16px rgba(99,102,241,0.5), 0 0 0 4px rgba(255,255,255,0.95)';
  });

  return wrapper;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 구 클러스터 마커 (Level 7-8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createGuClusterContent(guName: string, count: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    cursor: pointer; transform: translate(-50%, -50%);
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  `;

  const circle = document.createElement('div');
  const size = count >= 50 ? 58 : count >= 10 ? 50 : 44;
  circle.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: linear-gradient(135deg, #43a047 0%, #2e7d32 50%, #1b5e20 100%);
    color: #fff; font-size: ${count >= 100 ? '14px' : '16px'}; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 3px 12px rgba(59,130,246,0.45), 0 0 0 3px rgba(255,255,255,0.95);
    font-family: 'GmarketSans', sans-serif;
    letter-spacing: -0.5px;
  `;
  circle.textContent = String(count);

  const label = document.createElement('div');
  label.style.cssText = `
    background: rgba(255,255,255,0.97); color: #1b5e20;
    font-size: 12px; font-weight: 700; padding: 4px 12px;
    border-radius: 14px; white-space: nowrap;
    box-shadow: 0 1px 6px rgba(0,0,0,0.1);
    border: 1px solid rgba(46,125,50,0.12);
    font-family: 'GmarketSans', sans-serif;
  `;
  label.textContent = guName;

  wrapper.appendChild(circle);
  wrapper.appendChild(label);

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1.1)';
    circle.style.boxShadow = '0 5px 16px rgba(59,130,246,0.55), 0 0 0 3px rgba(255,255,255,1)';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
    circle.style.boxShadow = '0 3px 12px rgba(59,130,246,0.45), 0 0 0 3px rgba(255,255,255,0.95)';
  });

  return wrapper;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 동 클러스터 마커 (Level 5-6, 피터팬 스타일)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createDongClusterContent(dongName: string, count: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    cursor: pointer; transform: translate(-50%, -50%);
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  `;

  const circle = document.createElement('div');
  const size = count >= 100 ? 52 : count >= 10 ? 46 : 40;
  circle.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: #fff; font-size: ${count >= 100 ? '13px' : '15px'}; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(34,197,94,0.4), 0 0 0 3px rgba(255,255,255,0.9);
    flex-shrink: 0;
    font-family: 'GmarketSans', sans-serif;
  `;
  circle.textContent = String(count);

  const label = document.createElement('div');
  label.style.cssText = `
    background: rgba(255,255,255,0.95); color: #1a1a1a;
    font-size: 12px; font-weight: 600; padding: 4px 10px;
    border-radius: 12px; white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    border: 1px solid rgba(0,0,0,0.06);
    font-family: 'GmarketSans', sans-serif;
  `;
  label.textContent = dongName;

  wrapper.appendChild(circle);
  wrapper.appendChild(label);

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1.08)';
    circle.style.boxShadow = '0 4px 12px rgba(34,197,94,0.5), 0 0 0 3px rgba(255,255,255,1)';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
    circle.style.boxShadow = '0 2px 8px rgba(34,197,94,0.4), 0 0 0 3px rgba(255,255,255,0.9)';
  });

  return wrapper;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 마커 hover 미리보기 카드 (Level 1-4에서 마커 위에 표시)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createHoverPreviewContent(listing: Listing): HTMLElement {
  const priceText = listing.deal === '매매'
    ? formatPrice(listing.price || 0)
    : listing.deal === '월세'
    ? `${formatPrice(listing.deposit)}/${listing.monthly}만`
    : formatPrice(listing.deposit);

  const colorMap: Record<string, string> = {
    '전세': '#3B82F6', '월세': '#F97316', '매매': '#22C55E',
  };
  const dealColor = colorMap[listing.deal] || '#3B82F6';
  const area = listing.area_m2 ? `${listing.area_m2}㎡` : '';
  const titleText = (listing.title || listing.dong || '매물')
    .toString().slice(0, 28);

  const card = document.createElement('div');
  card.style.cssText = `
    background: #fff; border: 1px solid rgba(0,0,0,0.08);
    border-radius: 12px; padding: 10px 12px; min-width: 180px; max-width: 220px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    transform: translate(-50%, calc(-100% - 48px));
    font-family: 'GmarketSans', sans-serif; pointer-events: none;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const badge = document.createElement('span');
  badge.style.cssText = `
    background:${dealColor};color:#fff;font-size:9.5px;font-weight:700;
    padding:2px 6px;border-radius:6px;letter-spacing:0.02em;
  `;
  badge.textContent = listing.deal;
  const price = document.createElement('span');
  price.style.cssText = 'font-size:13px;font-weight:800;color:#111;white-space:nowrap;';
  price.textContent = priceText;
  header.appendChild(badge);
  header.appendChild(price);
  card.appendChild(header);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11.5px;color:#374151;line-height:1.35;margin-bottom:2px;';
  title.textContent = titleText;
  card.appendChild(title);

  if (area) {
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10.5px;color:#9CA3AF;';
    meta.textContent = `${area}${listing.dong ? ' · ' + listing.dong : ''}`;
    card.appendChild(meta);
  }

  // 말풍선 꼬리
  const tail = document.createElement('div');
  tail.style.cssText = `
    position:absolute; left:50%; bottom:-6px;
    transform:translateX(-50%);
    width:0;height:0;
    border-left:6px solid transparent;border-right:6px solid transparent;
    border-top:6px solid #fff;
    filter: drop-shadow(0 1px 0 rgba(0,0,0,0.08));
  `;
  card.style.position = 'relative';
  card.appendChild(tail);

  return card;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 개별 매물 마커 (Level 1-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createPriceMarkerContent(listing: Listing, isSelected: boolean = false): HTMLElement {
  const priceText = listing.deal === '매매'
    ? formatPrice(listing.price || 0)
    : listing.deal === '월세'
    ? `${formatPrice(listing.deposit)}/${listing.monthly}만`
    : formatPrice(listing.deposit);

  const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    '전세': { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8', dot: '#3B82F6' },
    '월세': { bg: '#FFF7ED', border: '#F97316', text: '#C2410C', dot: '#F97316' },
    '매매': { bg: '#F0FDF4', border: '#22C55E', text: '#15803D', dot: '#22C55E' },
  };
  const colors = colorMap[listing.deal] || colorMap['전세'];

  const content = document.createElement('div');
  // T2-3: 선택된 마커는 solid 배경 + 키 컬러 반전 + 강한 그림자로 하이라이트
  const baseBg = isSelected ? colors.border : colors.bg;
  const baseColor = isSelected ? '#fff' : colors.text;
  const baseShadow = isSelected
    ? `0 6px 20px ${colors.border}66, 0 0 0 3px ${colors.border}33`
    : '0 2px 6px rgba(0,0,0,0.15)';
  const baseScale = isSelected ? 'scale(1.08)' : 'scale(1)';
  content.style.cssText = `
    background: ${baseBg}; border: 2px solid ${colors.border};
    color: ${baseColor}; font-size: 11px; font-weight: 700;
    padding: 4px 10px; border-radius: 20px; white-space: nowrap;
    cursor: pointer; box-shadow: ${baseShadow};
    transform: translate(-50%, -100%) ${baseScale};
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    position: relative; font-family: 'GmarketSans', sans-serif;
  `;

  const dealBadge = document.createElement('span');
  dealBadge.style.cssText = `
    background: ${colors.border}; color: #fff;
    font-size: 9px; padding: 1px 5px; border-radius: 6px;
    margin-right: 4px; font-weight: 600;
  `;
  dealBadge.textContent = listing.deal;

  const priceSpan = document.createElement('span');
  priceSpan.textContent = priceText;

  content.appendChild(dealBadge);
  content.appendChild(priceSpan);

  // 말풍선 꼬리
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute; bottom: -7px; left: 50%;
    transform: translateX(-50%); width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 7px solid ${colors.border};
  `;
  content.appendChild(tail);

  content.addEventListener('mouseenter', () => {
    content.style.transform = 'translate(-50%, -100%) scale(1.1)';
    content.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    content.style.zIndex = '100';
  });
  content.addEventListener('mouseleave', () => {
    // 선택된 상태라면 base 스타일로 복귀
    content.style.transform = `translate(-50%, -100%) ${baseScale}`;
    content.style.boxShadow = baseShadow;
    content.style.zIndex = '';
  });

  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 지도 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MapSearchPageInner() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();

  const { listings, loading, total, fetchListings } = useMapListings();
  const [filters, setFilters] = useState<ListingFilter>(() => queryToFilter(new URLSearchParams(searchParams.toString())));
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [mapReady, setMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // ━━━ 필터 → URL 쿼리 동기화 ━━━
  useEffect(() => {
    const q = filterToQuery(filters);
    const url = q ? `/map?${q}` : '/map';
    window.history.replaceState(null, '', url);
  }, [filters]);
  // T3-2: 좌측 리스트 무한스크롤 — 초기 20건, 스크롤 시 20건씩 추가
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // 검색 + 상세 필터 (클라이언트 사이드 — 거래/유형/가격/면적/층/옵션/방향/입주/용도)
  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return listings.filter((l) => {
      // 검색어
      if (q) {
        const hit =
          l.title?.toLowerCase().includes(q) ||
          l.dong?.toLowerCase().includes(q) ||
          (l.address && l.address.toLowerCase().includes(q)) ||
          l.type?.toLowerCase().includes(q) ||
          l.deal?.toLowerCase().includes(q) ||
          String(l.id).includes(q);
        if (!hit) return false;
      }

      // 거래유형 다중
      if (filters.deals?.length && !filters.deals.includes(l.deal)) return false;
      // 매물유형 다중
      if (filters.types?.length && !filters.types.includes(l.type)) return false;

      // 보증금 범위 (전세·월세 대상)
      if (filters.minDeposit != null && (l.deposit ?? 0) < filters.minDeposit) return false;
      if (filters.maxDeposit != null && (l.deposit ?? 0) > filters.maxDeposit) return false;
      // 월세 범위
      if (filters.minMonthly != null && (l.monthly ?? 0) < filters.minMonthly) return false;
      if (filters.maxMonthly != null && (l.monthly ?? 0) > filters.maxMonthly) return false;

      // 면적 범위
      const area = (l as any).area_m2 ?? (l as any).area ?? 0;
      if (filters.minArea != null && area < filters.minArea) return false;
      if (filters.maxArea != null && area > filters.maxArea) return false;

      // 층수
      if (filters.floorCategory && !floorMatches((l as any).floor_current ?? (l as any).floor, filters.floorCategory)) return false;

      // 방향
      if (filters.direction && (l as any).direction !== filters.direction) return false;

      // 옵션 토글 (요구된 것은 반드시 true이어야)
      if (filters.options) {
        if (filters.options.fullOption && !((l as any).full_option)) return false;
        if (filters.options.pet && !l.pet) return false;
        if (filters.options.parking && !l.parking) return false;
        if (filters.options.elevator && !l.elevator) return false;
        if (filters.options.balcony && !((l as any).balcony)) return false;
        if (filters.options.newBuild && !((l as any).new_build || (l as any).is_new)) return false;
      }

      // 입주 가능일
      if (filters.moveIn === 'immediate' && (l as any).move_in_type && (l as any).move_in_type !== 'immediate') return false;
      if (filters.moveIn === 'negotiable' && (l as any).move_in_type && (l as any).move_in_type !== 'negotiable') return false;

      // 상업용
      if (filters.businessUseable && !((l as any).business_use_ok || (l as any).business_type)) return false;
      if (filters.goodwillFreeOnly && ((l as any).goodwill_fee ?? 0) > 0) return false;

      return true;
    });
  }, [listings, searchQuery, filters]);

  // T3-2: filteredListings 바뀌면 가시 범위 초기화 (bbox 이동·검색어 변경 시 맨 위부터)
  useEffect(() => {
    setVisibleCount(20);
  }, [filteredListings]);

  // T3-2: 센티넬 가시화 시 20건씩 추가 로드 (IntersectionObserver)
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    if (visibleCount >= filteredListings.length) return; // 전부 노출됨
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + 20, filteredListings.length));
        }
      },
      { rootMargin: '120px 0px' } // 조금 미리 로드
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, filteredListings.length]);

  // 줌 레벨 텍스트
  const zoomLevelLabel = useMemo(() => {
    if (zoomLevel >= 9) return '시/도';
    if (zoomLevel >= 7) return '구/군';
    if (zoomLevel >= 5) return '동/읍면';
    return '매물';
  }, [zoomLevel]);

  // ━━━ 카카오맵 초기화 (SDK 로드 대기 로직 포함) ━━━
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    const MAX_RETRIES = 50; // 200ms × 50 = 최대 10초 대기

    const initMap = () => {
      if (cancelled || !mapRef.current) return;
      if (mapInstanceRef.current) return; // 중복 초기화 방지

      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: DEFAULT_ZOOM,
      });

      mapInstanceRef.current = map;
      setMapReady(true);
      setZoomLevel(map.getLevel());

      const fetchBounds = () => {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        fetchListings({
          swLat: sw.getLat(),
          swLng: sw.getLng(),
          neLat: ne.getLat(),
          neLng: ne.getLng(),
        }, filters);
      };

      window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
        setZoomLevel(map.getLevel());
      });
      window.kakao.maps.event.addListener(map, 'idle', fetchBounds);

      // 초기 로드
      fetchBounds();
    };

    const tryInit = () => {
      if (cancelled) return;
      if (window.kakao?.maps?.load) {
        window.kakao.maps.load(initMap);
        return;
      }
      retries += 1;
      if (retries > MAX_RETRIES) {
        console.error('카카오맵 SDK 로드 타임아웃 (10초 초과). 네트워크 상태를 확인해주세요.');
        setMapReady(true); // 빈 상태라도 UI 렌더
        return;
      }
      retryTimer = setTimeout(tryInit, 200);
    };

    tryInit();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 백엔드로 넘길 서버 필터 (단일 deal/type + 가격 범위만)
  const serverFilter: ListingFilter = useMemo(() => {
    const sf: ListingFilter = {};
    if (filters.deals?.length === 1) sf.deal = filters.deals[0];
    if (filters.types?.length === 1) sf.type = filters.types[0];
    // 가격은 서버에서 단일 컬럼에만 걸리므로 단일 deal 선택된 경우에만 전달
    if (sf.deal) {
      if (filters.minDeposit != null) sf.minDeposit = filters.minDeposit;
      if (filters.maxDeposit != null) sf.maxDeposit = filters.maxDeposit;
    }
    return sf;
  }, [filters]);

  // ━━━ 필터 변경 시 재검색 ━━━
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    fetchListings({
      swLat: sw.getLat(),
      swLng: sw.getLng(),
      neLat: ne.getLat(),
      neLng: ne.getLng(),
    }, serverFilter);
  }, [serverFilter, fetchListings]);

  // ━━━ 마커 업데이트 — 줌 레벨에 따라 단계별 전환 ━━━
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // 기존 오버레이 전부 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const validListings = listings.filter((l) => l.lat && l.lng);
    if (validListings.length === 0) return;

    const level = map.getLevel();

    if (level >= 9) {
      // ━━━ 시/도 레벨 클러스터 ━━━
      const cityGroups: Record<string, { listings: Listing[]; latSum: number; lngSum: number }> = {};

      validListings.forEach((listing) => {
        const city = extractCity(listing.address || '');
        if (!cityGroups[city]) cityGroups[city] = { listings: [], latSum: 0, lngSum: 0 };
        cityGroups[city].listings.push(listing);
        cityGroups[city].latSum += listing.lat!;
        cityGroups[city].lngSum += listing.lng!;
      });

      Object.entries(cityGroups).forEach(([cityName, group]) => {
        const count = group.listings.length;
        const avgLat = group.latSum / count;
        const avgLng = group.lngSum / count;
        const position = new window.kakao.maps.LatLng(avgLat, avgLng);
        const content = createCityClusterContent(cityName, count);

        content.addEventListener('click', () => {
          // 시/도 클러스터 클릭 → 구 단위(레벨 7)로 이동 (단계별 탐색)
          map.setLevel(7, { anchor: position });
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 0.5, xAnchor: 0.5, zIndex: 10,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

    } else if (level >= 7) {
      // ━━━ 구/군 레벨 클러스터 ━━━
      const guGroups: Record<string, { listings: Listing[]; latSum: number; lngSum: number }> = {};

      validListings.forEach((listing) => {
        const gu = extractGu(listing.address || '');
        if (!guGroups[gu]) guGroups[gu] = { listings: [], latSum: 0, lngSum: 0 };
        guGroups[gu].listings.push(listing);
        guGroups[gu].latSum += listing.lat!;
        guGroups[gu].lngSum += listing.lng!;
      });

      Object.entries(guGroups).forEach(([guName, group]) => {
        const count = group.listings.length;
        const avgLat = group.latSum / count;
        const avgLng = group.lngSum / count;
        const position = new window.kakao.maps.LatLng(avgLat, avgLng);
        const content = createGuClusterContent(guName, count);

        content.addEventListener('click', () => {
          // 구/군 클러스터 클릭 → 동 단위(레벨 5)로 진입
          map.setLevel(5, { anchor: position });
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 0.5, xAnchor: 0.5, zIndex: 10,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

    } else if (level >= 5) {
      // ━━━ 동 레벨 클러스터 (피터팬 스타일) ━━━
      const dongGroups: Record<string, { listings: Listing[]; latSum: number; lngSum: number }> = {};

      validListings.forEach((listing) => {
        const dong = listing.dong || '기타';
        if (!dongGroups[dong]) dongGroups[dong] = { listings: [], latSum: 0, lngSum: 0 };
        dongGroups[dong].listings.push(listing);
        dongGroups[dong].latSum += listing.lat!;
        dongGroups[dong].lngSum += listing.lng!;
      });

      Object.entries(dongGroups).forEach(([dongName, group]) => {
        const count = group.listings.length;
        const avgLat = group.latSum / count;
        const avgLng = group.lngSum / count;
        const position = new window.kakao.maps.LatLng(avgLat, avgLng);
        const content = createDongClusterContent(dongName, count);

        content.addEventListener('click', () => {
          // 동 클러스터 클릭 → 개별 매물 마커 단계(레벨 3)로 진입
          map.setLevel(3, { anchor: position });
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 0.5, xAnchor: 0.5, zIndex: 10,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

    } else {
      // ━━━ 개별 매물 마커 (줌인 상태) ━━━
      validListings.forEach((listing) => {
        const position = new window.kakao.maps.LatLng(listing.lat, listing.lng);
        const isSelected = selectedId === listing.id;
        const content = createPriceMarkerContent(listing, isSelected);

        content.addEventListener('click', () => {
          setDetailId(listing.id);
          setSelectedId(listing.id);
          map.panTo(position);
        });

        // ━━━ Hover 미리보기 카드 (T1-5) ━━━
        let hoverOverlay: any = null;
        let hoverTimer: any = null;
        const showHover = () => {
          if (hoverOverlay) return;
          const hoverContent = createHoverPreviewContent(listing);
          hoverOverlay = new window.kakao.maps.CustomOverlay({
            position, content: hoverContent, yAnchor: 1, xAnchor: 0.5, zIndex: 200,
          });
          hoverOverlay.setMap(map);
        };
        const hideHover = () => {
          if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
          if (hoverOverlay) { hoverOverlay.setMap(null); hoverOverlay = null; }
        };
        content.addEventListener('mouseenter', () => {
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(showHover, 180);
        });
        content.addEventListener('mouseleave', hideHover);

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 1.5, xAnchor: 0.5,
          zIndex: selectedId === listing.id ? 100 : 1,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }
  }, [listings, selectedId, zoomLevel]);

  // ━━━ T2-3: selectedId 변경 → 리스트 카드 자동 스크롤 ━━━
  useEffect(() => {
    if (!selectedId) return;
    const el = document.querySelector(`[data-listing-id="${selectedId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  // ━━━ 리스트 카드 호버 ━━━
  const handleCardHover = useCallback((id: number | null) => {
    setSelectedId(id);
    if (id && mapInstanceRef.current) {
      const listing = listings.find((l) => l.id === id);
      if (listing?.lat && listing?.lng) {
        const pos = new window.kakao.maps.LatLng(listing.lat, listing.lng);
        mapInstanceRef.current.panTo(pos);
      }
    }
  }, [listings]);

  // ━━━ 매물 클릭 → 슬라이드 패널 열기 ━━━
  const handleListingClick = useCallback((id: number) => {
    setDetailId(id);
    setSelectedId(id);
    if (mapInstanceRef.current) {
      const listing = listings.find((l) => l.id === id);
      if (listing?.lat && listing?.lng) {
        const pos = new window.kakao.maps.LatLng(listing.lat, listing.lng);
        mapInstanceRef.current.panTo(pos);
      }
    }
  }, [listings]);

  // ━━━ 내 위치로 이동 ━━━
  const handleGoToMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 서비스를 지원하지 않습니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mapInstanceRef.current || !window.kakao?.maps) return;
        const map = mapInstanceRef.current;
        const { latitude, longitude } = pos.coords;
        const center = new window.kakao.maps.LatLng(latitude, longitude);
        map.setLevel(3);
        map.panTo(center);
      },
      () => {
        alert('위치 권한을 허용해 주세요. (브라우저 주소창 왼쪽 자물쇠 아이콘에서 설정)');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  // ━━━ 현재 지도 영역 다시 검색 (수동) ━━━
  const handleResearchArea = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    fetchListings({
      swLat: sw.getLat(),
      swLng: sw.getLng(),
      neLat: ne.getLat(),
      neLng: ne.getLng(),
    }, serverFilter);
  }, [fetchListings, serverFilter]);

  // ━━━ 필터 토글 핸들러 ━━━
  const toggleDealFilter = (deal: DealType) => {
    setFilters((prev) => {
      const list = new Set(prev.deals || []);
      list.has(deal) ? list.delete(deal) : list.add(deal);
      return { ...prev, deals: Array.from(list) };
    });
  };

  const toggleTypeFilter = (type: ListingType) => {
    setFilters((prev) => {
      const list = new Set(prev.types || []);
      list.has(type) ? list.delete(type) : list.add(type);
      return { ...prev, types: Array.from(list) };
    });
  };

  // 모든 필터 초기화
  const resetAllFilters = () => {
    setFilters({});
    setSearchQuery('');
  };

  // 활성 필터 개수 (초기화 버튼 노출 여부 결정)
  const activeFilterCount = [
    (filters.deals?.length || 0) > 0,
    (filters.types?.length || 0) > 0,
    filters.maxDeposit != null,
    filters.minDeposit != null,
    filters.maxMonthly != null,
    filters.minMonthly != null,
    filters.maxArea != null,
    filters.minArea != null,
    !!filters.floorCategory,
    !!filters.direction,
    !!filters.moveIn,
    !!filters.businessUseable,
    !!filters.goodwillFreeOnly,
    Object.values(filters.options || {}).some(Boolean),
    !!searchQuery.trim(),
  ].filter(Boolean).length;

  // 활성 필터를 칩 문자열로 변환
  const activeChips: { key: string; label: string; clear: () => void }[] = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    (filters.deals || []).forEach((d) => chips.push({
      key: `deal-${d}`, label: d,
      clear: () => setFilters((p) => ({ ...p, deals: (p.deals || []).filter((x) => x !== d) })),
    }));
    (filters.types || []).forEach((t) => chips.push({
      key: `type-${t}`, label: t,
      clear: () => setFilters((p) => ({ ...p, types: (p.types || []).filter((x) => x !== t) })),
    }));
    if (filters.minDeposit || filters.maxDeposit) chips.push({
      key: 'deposit', label: `보증금 ${filters.minDeposit || 0}~${filters.maxDeposit || '∞'}`,
      clear: () => setFilters((p) => ({ ...p, minDeposit: undefined, maxDeposit: undefined })),
    });
    if (filters.minMonthly || filters.maxMonthly) chips.push({
      key: 'monthly', label: `월세 ${filters.minMonthly || 0}~${filters.maxMonthly || '∞'}`,
      clear: () => setFilters((p) => ({ ...p, minMonthly: undefined, maxMonthly: undefined })),
    });
    if (filters.minArea || filters.maxArea) chips.push({
      key: 'area', label: `면적 ${filters.minArea || 0}~${filters.maxArea || '∞'}㎡`,
      clear: () => setFilters((p) => ({ ...p, minArea: undefined, maxArea: undefined })),
    });
    if (filters.floorCategory) {
      const labels: Record<string, string> = { basement: '지하', low: '저층', mid: '중층', high: '고층' };
      chips.push({
        key: 'floor', label: labels[filters.floorCategory] || filters.floorCategory,
        clear: () => setFilters((p) => ({ ...p, floorCategory: undefined })),
      });
    }
    if (filters.direction) chips.push({
      key: 'dir', label: `${filters.direction}향`,
      clear: () => setFilters((p) => ({ ...p, direction: undefined })),
    });
    if (filters.moveIn) {
      const labels: Record<string, string> = { immediate: '즉시입주', negotiable: '협의', date: '날짜지정' };
      chips.push({
        key: 'moveIn', label: labels[filters.moveIn] || filters.moveIn,
        clear: () => setFilters((p) => ({ ...p, moveIn: undefined, moveInDate: undefined })),
      });
    }
    Object.entries(filters.options || {}).forEach(([k, v]) => {
      if (!v) return;
      const labels: Record<string, string> = {
        fullOption: '풀옵션', pet: '반려동물', parking: '주차',
        elevator: '엘리베이터', balcony: '발코니', newBuild: '신축',
      };
      chips.push({
        key: `opt-${k}`, label: labels[k] || k,
        clear: () => setFilters((p) => ({
          ...p, options: { ...(p.options || {}), [k]: false }
        })),
      });
    });
    if (filters.businessUseable) chips.push({
      key: 'biz', label: '음식점 가능',
      clear: () => setFilters((p) => ({ ...p, businessUseable: undefined })),
    });
    if (filters.goodwillFreeOnly) chips.push({
      key: 'gwFree', label: '권리금 없음',
      clear: () => setFilters((p) => ({ ...p, goodwillFreeOnly: undefined })),
    });
    return chips;
  }, [filters]);

  return (
    <div className="pt-16 h-[100dvh] flex flex-col bg-wishes-bg">
      {/* ━━━ 필터 바 — 글래스 + 지도 위 floating 느낌 ━━━ */}
      <div className="bg-white/90 backdrop-blur-xl border-b border-gray-200/60 shadow-[0_4px_16px_rgba(0,0,0,0.04)] shrink-0">
        {/* 1행: 거래유형 (다중) + 상세필터 + 검색 + 초기화 + 모바일뷰 */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {dealTypes.map((deal) => {
              const isActive = (filters.deals || []).includes(deal);
              return (
                <button
                  key={deal}
                  onClick={() => toggleDealFilter(deal)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-full border-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary'
                  }`}
                >
                  {deal}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* 상세필터 버튼 */}
            <button
              onClick={() => setShowFilterSheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-full border-2 border-wishes-primary/30 bg-wishes-primary/5 text-wishes-primary hover:bg-wishes-primary hover:text-white transition-all"
              title="상세 필터 열기"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>상세필터</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-wishes-primary text-white rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* 초기화 */}
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border-2 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                title="모든 필터 초기화"
              >
                <X className="w-3.5 h-3.5" />
                <span>초기화</span>
              </button>
            )}

            {/* 검색 */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-full border-2 transition-all shadow-sm ${
                showSearch
                  ? 'bg-wishes-primary text-white border-wishes-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary hover:text-wishes-primary'
              }`}
              title="매물 검색"
            >
              <Search className="w-3.5 h-3.5" />
              <span>검색</span>
            </button>

            {/* 모바일 뷰 토글 */}
            <div className="md:hidden flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMobileView('map')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mobileView === 'map' ? 'bg-white shadow text-wishes-primary font-bold' : 'text-gray-500'
                }`}
              >
                <MapPin className="w-3 h-3 inline mr-1" />지도
              </button>
              <button
                onClick={() => setMobileView('list')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mobileView === 'list' ? 'bg-white shadow text-wishes-primary font-bold' : 'text-gray-500'
                }`}
              >
                <List className="w-3 h-3 inline mr-1" />목록
              </button>
            </div>
          </div>
        </div>

        {/* 2행: 매물유형 (다중 — 빌라·단기 포함) */}
        <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {listingTypes.map((type) => {
            const isActive = (filters.types || []).includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-wishes-secondary text-white border-wishes-secondary'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-wishes-secondary/50'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* 3행: 활성 필터 칩 (조건부) */}
        {activeChips.length > 0 && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-semibold text-wishes-muted shrink-0">적용됨</span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.clear}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-wishes-primary/10 text-wishes-primary border border-wishes-primary/20 hover:bg-wishes-primary/20 transition-all whitespace-nowrap"
              >
                <span>{chip.label}</span>
                <X className="w-2.5 h-2.5" />
              </button>
            ))}
          </div>
        )}

        {/* 검색 입력창 */}
        {showSearch && (
          <div className="px-4 pb-3 animate-fade-in-up">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="지역, 매물명, 키워드로 검색..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-300 text-white hover:bg-gray-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 상세 필터 시트 */}
      <MapFilterSheet
        open={showFilterSheet}
        filter={filters}
        onChange={setFilters}
        onClose={() => setShowFilterSheet(false)}
        onReset={resetAllFilters}
      />

      {/* ━━━ 리스트 + 지도 (2패널: 좌측 리스트 / 우측 지도 — 다방·직방·피터팬·네모 표준) ━━━ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ━━━ 매물 리스트 (좌측 고정 패널) — 1차 브라우징 영역 ━━━ */}
        <aside className={`${mobileView === 'map' ? 'hidden md:flex' : 'flex'} w-full md:w-[420px] bg-white md:border-r border-gray-200 shrink-0 flex-col z-10`}>
          {/* 리스트 헤더 — sticky: 스크롤해도 카운트 상시 노출 */}
          <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold text-gray-700">매물</span>
              <strong className="text-[17px] font-extrabold text-wishes-primary tabular-nums">
                {searchQuery ? filteredListings.length : total}
              </strong>
              <span className="text-[12px] font-medium text-wishes-muted">건</span>
              {searchQuery && (
                <span className="ml-1 text-[11px] text-wishes-muted truncate max-w-[120px]">
                  &quot;{searchQuery}&quot;
                </span>
              )}
            </div>
            {filteredListings.length > 20 && (
              <div className="text-[10.5px] text-wishes-muted font-medium">
                {Math.min(visibleCount, filteredListings.length)}/{filteredListings.length}
              </div>
            )}
          </div>

          {/* 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-2.5">
              {filteredListings.length > 0 ? (
                <>
                  {filteredListings.slice(0, visibleCount).map((listing) => (
                    <div
                      key={listing.id}
                      data-listing-id={listing.id}
                      onClick={() => handleListingClick(listing.id)}
                      className={`cursor-pointer rounded-lg transition-all ${detailId === listing.id ? 'ring-2 ring-wishes-primary bg-wishes-primary/5' : selectedId === listing.id ? 'ring-2 ring-wishes-secondary/70 bg-wishes-secondary/5' : ''}`}
                    >
                      <ListingCard
                        listing={listing}
                        compact
                        noLink
                        onHover={handleCardHover}
                      />
                    </div>
                  ))}
                  {/* 무한스크롤 센티넬 */}
                  {visibleCount < filteredListings.length && (
                    <div
                      ref={loadMoreSentinelRef}
                      className="flex items-center justify-center py-4 text-xs text-wishes-muted"
                    >
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      다음 {Math.min(20, filteredListings.length - visibleCount)}건 불러오는 중…
                    </div>
                  )}
                  {visibleCount >= filteredListings.length && filteredListings.length > 20 && (
                    <div className="flex items-center justify-center py-4 text-[11px] text-wishes-muted">
                      이 영역의 모든 매물을 불러왔습니다
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium">
                    {loading ? '검색 중...' : searchQuery ? '검색 결과가 없습니다' : '이 영역에 매물이 없습니다'}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-xs text-wishes-secondary hover:underline"
                    >
                      검색어 초기화
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ━━━ 카카오맵 영역 (우측 flex-1) — 2차 맥락/지역감 영역 ━━━ */}
        <div className={`relative ${mobileView === 'list' ? 'hidden md:block' : ''} flex-1`}>
          <div ref={mapRef} className="w-full h-full kakao-map-container" />

          {/* 로딩 인디케이터 */}
          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm z-20">
              <Loader2 className="w-4 h-4 animate-spin text-wishes-secondary" />
              매물 검색 중...
            </div>
          )}

          {/* 줌 레벨 표시 + 매물 카운트 */}
          {!loading && mapReady && (
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
              <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md text-xs font-medium text-gray-700 flex items-center gap-2">
                <span>현재 지도 영역</span>
                <strong className="text-wishes-primary">{total}</strong>건
              </div>
              <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full shadow text-[10px] font-semibold text-wishes-muted flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  zoomLevel >= 9 ? 'bg-green-700' :
                  zoomLevel >= 7 ? 'bg-blue-500' :
                  zoomLevel >= 5 ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                {zoomLevelLabel} 단위 표시
              </div>
            </div>
          )}

          {/* 매물 0건일 때 안내 (지도 중앙) */}
          {!loading && mapReady && total === 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white/95 backdrop-blur-md px-6 py-5 rounded-2xl shadow-xl border border-gray-200 text-center max-w-xs animate-fade-in">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-wishes-primary mb-1">이 영역에 매물이 없습니다</p>
              <p className="text-[11px] text-wishes-muted leading-relaxed">
                지도를 이동하거나 축소해서 더 넓은 지역을 살펴보세요.
                {activeFilterCount > 0 && ' 필터를 해제하면 더 많은 매물을 볼 수 있습니다.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className="mt-3 px-4 py-1.5 text-xs font-bold rounded-full bg-red-50 text-red-600 border-2 border-red-200 hover:bg-red-100 transition-all"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )}

          {/* ━━━ 거래유형 색상 범례 (개별 마커 레벨에서만 노출) ━━━ */}
          {mapReady && zoomLevel < 5 && total > 0 && (
            <div className="absolute bottom-6 left-6 z-20 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-gray-100 px-3 py-2 flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-blue-700">전세</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span className="text-orange-700">월세</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-700">매매</span>
              </span>
            </div>
          )}

          {/* ━━━ 우측 하단 지도 컨트롤 — 내 위치 / 재검색 ━━━ */}
          {mapReady && (
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
              <button
                onClick={handleResearchArea}
                className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-full shadow-lg text-xs font-bold text-wishes-primary border-2 border-wishes-primary/10 hover:bg-wishes-primary hover:text-white transition-all"
                title="현재 지도 영역에서 매물 다시 검색"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                이 지역 재검색
              </button>
              <button
                onClick={handleGoToMyLocation}
                className="flex items-center justify-center w-11 h-11 bg-white/95 backdrop-blur-md rounded-full shadow-lg text-wishes-primary border-2 border-wishes-primary/10 hover:bg-wishes-primary hover:text-white transition-all self-end"
                title="내 위치로 이동"
                aria-label="내 위치로 이동"
              >
                <Crosshair className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ━━━ 매물 상세 슬라이드 패널 (데스크탑: 리스트 우측에서 슬라이드 → 지도 위 오버레이 / 모바일: 전체화면) ━━━ */}
        <div
          className={`hidden md:block absolute top-0 bottom-0 left-[420px] z-30 bg-white border-l border-gray-200 shadow-2xl transition-all duration-300 ease-in-out ${detailId ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}
          style={{ width: '440px' }}
        >
          {detailId && (
            <MapListingPanel
              listingId={detailId}
              onClose={() => setDetailId(null)}
            />
          )}
        </div>

        {/* 모바일 상세 패널 (전체화면 오버레이) */}
        {detailId && (
          <div className="md:hidden fixed inset-0 top-20 z-40 bg-white animate-fade-in">
            <MapListingPanel
              listingId={detailId}
              onClose={() => setDetailId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Suspense 래퍼 — useSearchParams() prerender 요구사항 충족
export default function MapSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-wishes-bg"><div className="text-wishes-muted">지도 불러오는 중...</div></div>}>
      <MapSearchPageInner />
    </Suspense>
  );
}
