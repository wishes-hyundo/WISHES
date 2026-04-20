'use client';

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import MapListingPanel from '@/components/MapListingPanel';
import { formatPrice } from '@/lib/utils';
import { displayTitle } from '@/lib/formatListingTitle';
import { MapPin, List, Loader2, Search, X, Building2, Crosshair, RefreshCw, SlidersHorizontal, Edit3, Check, Train, Navigation, Home } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';
import MapFilterSheet from '@/components/MapFilterSheet';
import { useRouter, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    kakao: any;
  }
}

const dealTypes: DealType[] = ['매매', '전세', '월세', '단기'];
const listingTypes: ListingType[] = [
  '원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라',
  '주택', '상가', '사무실', '지식산업센터', '토지'
];

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
  // 15차 — 피터팬/네모 시그니처: 단일 원형 버블 + 내부 2줄 "동명\n매물 N"
  const wrapper = document.createElement('div');
  const size = count >= 100 ? 74 : count >= 30 ? 66 : count >= 10 ? 60 : 54;
  wrapper.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: 50%;
    background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 55%, #43a047 100%);
    color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1px;
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease;
    box-shadow: 0 4px 14px rgba(27,94,32,0.45), 0 0 0 3px rgba(255,255,255,0.95);
    font-family: 'GmarketSans', sans-serif;
    user-select: none;
  `;

  const dong = document.createElement('div');
  const dongFont = count >= 100 ? 12 : count >= 30 ? 11.5 : 11;
  dong.style.cssText = `
    font-size: ${dongFont}px; font-weight: 800; letter-spacing: -0.3px;
    line-height: 1.1; max-width: ${size - 14}px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  `;
  // 동명이 너무 길면 잘라냄
  dong.textContent = dongName.length > 5 ? dongName.slice(0, 5) : dongName;

  const countEl = document.createElement('div');
  countEl.style.cssText = `
    font-size: ${count >= 100 ? 13 : 14}px; font-weight: 800;
    letter-spacing: -0.5px; line-height: 1.05;
    color: #FFF8E1;
  `;
  countEl.textContent = `${count}건`;

  wrapper.appendChild(dong);
  wrapper.appendChild(countEl);

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1.1)';
    wrapper.style.boxShadow = '0 6px 18px rgba(27,94,32,0.55), 0 0 0 4px #fff';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
    wrapper.style.boxShadow = '0 4px 14px rgba(27,94,32,0.45), 0 0 0 3px rgba(255,255,255,0.95)';
  });

  return wrapper;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유형·거래 구분 헬퍼 + meta 빌더 (hover card용)
// 네모/직방 관행: 버블=가격, 카드=가격외 모든 것. 유형별 field set이 달라야 함
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function isCommercialType(type: string | null | undefined): boolean {
  //   - 정식: '상가', '사무실', '사무실/상가'(크롤링 레거시), '지식산업센터'
  //   - 주거성: '원룸','투룸','쓰리룸','오피스텔','아파트','빌라','주택' (return false)
  const t = (type || '').trim();
  if (!t) return false;
  return (
    t === '상가' ||
    t === '사무실' ||
    t === '사무실/상가' ||
    t === '지식산업센터' ||
    t.includes('상가') ||
    t.includes('사무실')
  );
}

function formatFloorCompact(listing: Listing): string {
  const fc = (listing.floor_current || '').toString().trim();
  const ft = (listing.floor_total || '').toString().trim();
  if (!fc) return '';
  // 이미 "3층" 포함 형태면 그대로
  if (fc.includes('층')) return ft ? `${fc.replace('층','')}/${ft.replace('층','')}층` : fc;
  // 숫자 혹은 '지하1' 등
  if (ft) return `${fc}/${ft}층`;
  return `${fc}층`;
}

function formatAreaCompact(area: number | null | undefined): string {
  if (!area || area <= 0) return '';
  const m2 = Math.round(area);
  const pyeong = Math.round(area / 3.3);
  return `${m2}㎡(${pyeong}평)`;
}

// 주요 스펙 1줄: 면적 · 층 · 방/업종
function buildPrimaryMeta(listing: Listing): string {
  const parts: string[] = [];
  const commercial = isCommercialType(listing.type);

  // 면적 — 상가는 '전용', 주거는 그대로
  const areaStr = formatAreaCompact(listing.area_m2);
  if (areaStr) parts.push(commercial ? `전용 ${areaStr}` : areaStr);

  // 층 — 지상/지하 포함
  const floorStr = formatFloorCompact(listing);
  if (floorStr) parts.push(floorStr);

  // 상가·사무실: 업종(사용승인/영업종목) / 주거: 방·욕실
  if (commercial) {
    if (listing.usage_approved) parts.push(String(listing.usage_approved).slice(0, 10));
    else if (listing.business_type) parts.push(String(listing.business_type).slice(0, 10));
  } else {
    if (listing.rooms) {
      parts.push(listing.bathrooms ? `${listing.rooms}룸/${listing.bathrooms}욕실` : `${listing.rooms}룸`);
    }
  }

  return parts.join(' · ');
}

// 보조 라인: 관리비·권리금·방향·대출·주차 등 유형별 차별 정보
function buildSecondaryMeta(listing: Listing): string {
  const parts: string[] = [];
  const commercial = isCommercialType(listing.type);
  const deal = listing.deal;

  if (commercial) {
    // 상가·사무실: 권리금 → 관리비 → 엘리베이터/주차 순
    if (listing.goodwill_fee != null) {
      parts.push(listing.goodwill_fee > 0 ? `권리 ${formatPrice(listing.goodwill_fee)}` : '권리금 없음');
    }
    if (listing.maintenance_fee && listing.maintenance_fee > 0) {
      parts.push(`관리 ${listing.maintenance_fee}만`);
    }
    if (listing.parking) parts.push('주차');
    else if (listing.elevator) parts.push('EV');
  } else {
    // 주거·오피스텔: 방향 → 주차 → 옵션
    if (listing.direction) parts.push(String(listing.direction).slice(0, 6));
    if (listing.maintenance_fee && listing.maintenance_fee > 0) {
      parts.push(`관리 ${listing.maintenance_fee}만`);
    }
    if (listing.full_option) parts.push('풀옵션');
    else if (listing.parking) parts.push('주차');
  }

  // 매매 공통: 대출가능
  if (deal === '매매' && listing.loan_available) {
    parts.push('대출가능');
  }

  return parts.slice(0, 3).join(' · ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상태 배지 산출 (NEW · 급매 · 즉시입주)
// 기존 필드만 사용 — 신규 컬럼 없음 (features 배열 / created_at / available_date)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ListingBadgeSpec {
  label: string;
  color: string;
}

function getListingBadges(listing: Listing): ListingBadgeSpec[] {
  const out: ListingBadgeSpec[] = [];

  // 급매 — features 배열 혹은 제목에 키워드. 최고 우선 (오렌지)
  const featureStr = Array.isArray(listing.features)
    ? listing.features.join(' ')
    : '';
  const urgent = featureStr.includes('급매') || (listing.title || '').includes('급매');
  if (urgent) out.push({ label: '급매', color: '#F97316' });

  // NEW — created_at 7일 이내 (빨강)
  if (listing.created_at) {
    const t = Date.parse(listing.created_at);
    if (!Number.isNaN(t)) {
      const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
      if (days >= 0 && days <= 7) out.push({ label: 'NEW', color: '#DC2626' });
    }
  }

  // 즉시입주 — available_date '즉시' 혹은 이미 지난 날짜 (녹색)
  if (listing.available_date) {
    const s = String(listing.available_date).trim();
    if (s && (s.includes('즉시') || s === '협의')) {
      if (s.includes('즉시')) out.push({ label: '즉시입주', color: '#10B981' });
    } else {
      const t = Date.parse(s);
      // 오늘 포함 과거 = 이미 입주 가능
      if (!Number.isNaN(t) && t <= Date.now() + 24 * 60 * 60 * 1000) {
        out.push({ label: '즉시입주', color: '#10B981' });
      }
    }
  }

  return out.slice(0, 2); // 공간상 최대 2개
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 마커 hover 미리보기 카드 (Level 1-4에서 마커 위에 표시)
// 가격은 버블에 이미 노출 → 카드에서 제거하여 중복 제거, 유형·거래별 정보 노출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createHoverPreviewContent(listing: Listing): HTMLElement {
  // 제목 — 크롤링 매물의 주소 섞인 title도 displayTitle()이 안전하게 재가공
  const titleText = displayTitle(listing).slice(0, 30);
  const primaryMeta = buildPrimaryMeta(listing);
  const secondaryMeta = buildSecondaryMeta(listing);
  const badges = getListingBadges(listing);

  const card = document.createElement('div');
  card.style.cssText = `
    background: #fff; border: 1px solid rgba(0,0,0,0.08);
    border-radius: 10px; padding: 9px 11px; min-width: 170px; max-width: 230px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.14);
    transform: translate(-50%, calc(-100% - 48px));
    font-family: 'GmarketSans', sans-serif; pointer-events: none;
    position: relative;
  `;

  // 상태 배지 행 (제목 위)
  if (badges.length > 0) {
    const badgeRow = document.createElement('div');
    badgeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:5px;';
    for (const b of badges) {
      const chip = document.createElement('span');
      chip.style.cssText = `
        background:${b.color};color:#fff;
        font-size:9.5px;font-weight:800;letter-spacing:0.02em;
        padding:2px 6px;border-radius:4px;line-height:1.2;
      `;
      chip.textContent = b.label;
      badgeRow.appendChild(chip);
    }
    card.appendChild(badgeRow);
  }

  // 제목 (한 줄, 굵게)
  const title = document.createElement('div');
  title.style.cssText = 'font-size:12.5px;font-weight:700;color:#111;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  title.textContent = titleText;
  card.appendChild(title);

  // 주요 스펙 (면적·층·방/업종)
  if (primaryMeta) {
    const m = document.createElement('div');
    m.style.cssText = 'font-size:10.5px;color:#4B5563;line-height:1.4;margin-top:4px;';
    m.textContent = primaryMeta;
    card.appendChild(m);
  }

  // 보조 정보 (유형별 차별)
  if (secondaryMeta) {
    const m = document.createElement('div');
    m.style.cssText = 'font-size:10px;color:#9CA3AF;line-height:1.4;margin-top:2px;';
    m.textContent = secondaryMeta;
    card.appendChild(m);
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
  card.appendChild(tail);

  return card;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 개별 매물 마커 (Level 1-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createPriceMarkerContent(listing: Listing, isSelected: boolean = false, extraCount: number = 0): HTMLElement {
  // 16차 폴리싱 — 스프링 entry·선택 시 pulse ring·hover lift·진한 그림자
  const priceText = listing.deal === '매매'
    ? `매매 ${formatPrice(listing.price || 0)}`
    : listing.deal === '월세'
    ? `월세 ${formatPrice(listing.deposit)}/${listing.monthly}`
    : listing.deal === '단기'
    ? `단기 ${formatPrice(listing.deposit)}/${listing.monthly || 0}`
    : `전세 ${formatPrice(listing.deposit)}`;

  const colorMap: Record<string, { main: string; dark: string; glow: string; ring: string }> = {
    '전세': { main: '#2563EB', dark: '#1D4ED8', glow: 'rgba(37,99,235,0.45)', ring: 'rgba(37,99,235,0.25)' },
    '월세': { main: '#EA580C', dark: '#C2410C', glow: 'rgba(234,88,12,0.45)', ring: 'rgba(234,88,12,0.25)' },
    '매매': { main: '#16A34A', dark: '#15803D', glow: 'rgba(22,163,74,0.45)', ring: 'rgba(22,163,74,0.25)' },
    '단기': { main: '#9333EA', dark: '#7E22CE', glow: 'rgba(147,51,234,0.45)', ring: 'rgba(147,51,234,0.25)' },
  };
  const colors = colorMap[listing.deal] || colorMap['전세'];

  const content = document.createElement('div');
  const baseShadow = isSelected
    ? `0 10px 24px ${colors.glow}, 0 0 0 3px #fff, 0 0 0 6px ${colors.main}`
    : `0 3px 10px ${colors.glow}, 0 0 0 2px #fff`;
  const baseScale = isSelected ? 'scale(1.22)' : 'scale(1)';
  content.style.cssText = `
    background: ${isSelected ? colors.dark : colors.main};
    color: #fff;
    font-size: 12.5px; font-weight: 800; letter-spacing: -0.2px;
    padding: 6px 12px; border-radius: 999px; white-space: nowrap;
    cursor: pointer; box-shadow: ${baseShadow};
    transform: translate(-50%, -100%) scale(0.6);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease, background 0.12s ease, opacity 0.18s ease;
    position: relative; font-family: 'GmarketSans', sans-serif;
    user-select: none; z-index: ${isSelected ? 100 : 1};
    will-change: transform;
  `;

  // 스프링 entry 애니메이션 — next frame에 최종 스케일로 전환
  requestAnimationFrame(() => {
    content.style.transform = `translate(-50%, -100%) ${baseScale}`;
    content.style.opacity = '1';
  });

  const priceSpan = document.createElement('span');
  priceSpan.textContent = priceText;
  content.appendChild(priceSpan);

  // 상태 닷 — 급매/NEW/즉시입주 중 최우선 1개만 버블 우측 상단에 표시
  const bubbleBadges = getListingBadges(listing);
  if (bubbleBadges.length > 0) {
    const dot = document.createElement('span');
    dot.style.cssText = `
      position:absolute; top:-4px; right:-4px;
      width:10px; height:10px; border-radius:999px;
      background:${bubbleBadges[0].color};
      border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,0.25);
      pointer-events:none;
    `;
    dot.title = bubbleBadges[0].label;
    content.appendChild(dot);
  }

  // +N 디듑 배지 (16차: 클릭 타겟 식별용 data 속성)
  if (extraCount > 0) {
    const plusBadge = document.createElement('span');
    plusBadge.setAttribute('data-plus-badge', '1');
    plusBadge.style.cssText = `
      margin-left: 6px; padding: 1px 6px; border-radius: 999px;
      background: rgba(255,255,255,0.32); color: #fff;
      font-size: 10.5px; font-weight: 800; letter-spacing: -0.2px;
      border: 1px solid rgba(255,255,255,0.6);
      cursor: pointer;
    `;
    plusBadge.textContent = `+${extraCount}`;
    plusBadge.title = `이 위치에 ${extraCount + 1}개 매물 · 클릭하여 모두 보기`;
    content.appendChild(plusBadge);
  }

  // 말풍선 꼬리
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute; bottom: -6px; left: 50%;
    transform: translateX(-50%); width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 7px solid ${isSelected ? colors.dark : colors.main};
    filter: drop-shadow(0 1px 0 rgba(0,0,0,0.08));
    transition: border-top-color 0.12s ease;
  `;
  content.appendChild(tail);

  // 선택된 마커 — pulse ring (애니메이션)
  if (isSelected) {
    const pulseRing = document.createElement('div');
    pulseRing.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      width: 100%; height: 100%;
      border-radius: 999px;
      background: ${colors.ring};
      transform: translate(-50%, -50%);
      animation: wishesMarkerPulse 1.8s ease-out infinite;
      pointer-events: none; z-index: -1;
    `;
    content.appendChild(pulseRing);
    // 키프레임 스타일 주입 (1회만)
    if (!document.getElementById('wishes-marker-pulse-kf')) {
      const style = document.createElement('style');
      style.id = 'wishes-marker-pulse-kf';
      style.textContent = `
        @keyframes wishesMarkerPulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
          70% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  content.addEventListener('mouseenter', () => {
    content.style.transform = 'translate(-50%, -100%) scale(1.18) translateY(-3px)';
    content.style.boxShadow = `0 10px 22px ${colors.glow}, 0 0 0 3px #fff`;
    content.style.zIndex = '50';
    content.style.background = colors.dark;
    tail.style.borderTopColor = colors.dark;
  });
  content.addEventListener('mouseleave', () => {
    content.style.transform = `translate(-50%, -100%) ${baseScale}`;
    content.style.boxShadow = baseShadow;
    content.style.zIndex = isSelected ? '100' : '1';
    content.style.background = isSelected ? colors.dark : colors.main;
    tail.style.borderTopColor = isSelected ? colors.dark : colors.main;
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
  // 검색창은 2026 리디자인에서 항상 노출되므로 토글 state 제거됨
  const [detailId, setDetailId] = useState<number | null>(null);
  // 15차-3: 자동 검색 토글 (다방 시그니처) + 수동 재검색 버튼 상태
  const [autoRefetch, setAutoRefetch] = useState(true);
  const [mapMovedSinceFetch, setMapMovedSinceFetch] = useState(false);
  // 15차-3: 지하철역·동 자동완성 (직방 시그니처)
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ name: string; address: string; lat: number; lng: number; category: 'subway' | 'place' | 'building' | 'address' }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // 15차-3: "위치 그리기" 다각형 검색 (직방 차별 기능)
  const [drawMode, setDrawMode] = useState(false);
  const [drawPolygon, setDrawPolygon] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const drawPointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const drawOverlayRef = useRef<any>(null);
  // 지도 idle 리스너에서 최신 autoRefetch·fetch 함수에 접근하기 위한 ref
  const autoRefetchRef = useRef(true);
  const fetchBoundsRef = useRef<(() => void) | null>(null);
  useEffect(() => { autoRefetchRef.current = autoRefetch; }, [autoRefetch]);

  // ━━━ 17차 모바일: 지도↔목록 토글 시 Kakao relayout 필수 (container 0×0 → 복구) ━━━
  // 이전 동작: 모바일에서 '목록' 탭 → '지도' 탭으로 돌아오면 지도가 회색 빈 공간
  //   원인: display:none이던 container가 display:block이 되어도 Kakao는 자동 resize 없음
  // 수정: mobileView가 'map'으로 전환된 직후 relayout + 중심 재설정
  useEffect(() => {
    if (mobileView !== 'map' || !mapInstanceRef.current) return;
    // DOM 반영(layout) 이후 호출해야 정확한 크기 계산
    const t = setTimeout(() => {
      try {
        const map = mapInstanceRef.current;
        const center = map.getCenter();
        map.relayout();
        map.setCenter(center);
      } catch (_) { /* noop */ }
    }, 50);
    return () => clearTimeout(t);
  }, [mobileView]);

  // ━━━ 지도 마커 hover → 리스트 카드 하이라이트·스크롤 연동용 (마커 rebuild 방지 위해 useEffect deps 에서 제외) ━━━
  const [mapHoveredId, setMapHoveredId] = useState<number | null>(null);
  const mapHoveredTimerRef = useRef<any>(null);
  // 16차 폴리싱 — +N 배지 클릭 시 해당 좌표 매물 그룹 펼침
  const [expandedGroup, setExpandedGroup] = useState<{ lat: number; lng: number; listings: Listing[] } | null>(null);

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
      // 매물유형 다중 — 관대 매칭 (레거시 슬래시값 '사무실/상가' 호환)
      //   '상가' 선택 시 '사무실/상가' 도 걸리게 includes 기반으로 매칭.
      if (filters.types?.length) {
        const ltype = (l.type || '') as string;
        const hit = filters.types.some((t) => ltype === t || ltype.includes(t));
        if (!hit) return false;
      }

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

      // 15차-3: "위치 그리기" 다각형 내부 여부 (직방 시그니처)
      if (drawPolygon && drawPolygon.length >= 3 && l.lat != null && l.lng != null) {
        let inside = false;
        for (let i = 0, j = drawPolygon.length - 1; i < drawPolygon.length; j = i++) {
          const xi = drawPolygon[i].lat, yi = drawPolygon[i].lng;
          const xj = drawPolygon[j].lat, yj = drawPolygon[j].lng;
          const intersect = ((yi > l.lng) !== (yj > l.lng)) &&
            (l.lat < (xj - xi) * (l.lng - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        if (!inside) return false;
      }

      return true;
    });
  }, [listings, searchQuery, filters, drawPolygon]);

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
        setMapMovedSinceFetch(false);
      };
      // 외부에서 호출 가능하도록 ref 에 저장
      fetchBoundsRef.current = fetchBounds;

      window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
        setZoomLevel(map.getLevel());
      });
      // idle: 자동 모드일 때만 fetch, 수동 모드는 "이 지역 재검색" 배지 표시
      window.kakao.maps.event.addListener(map, 'idle', () => {
        if (autoRefetchRef.current) {
          fetchBounds();
        } else {
          setMapMovedSinceFetch(true);
        }
      });

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
          // 16차 폴리싱: 부드러운 stepped zoom + panTo
          // (Kakao setLevel 즉시 점프 → 단계별로 줌인해서 시각적 연속성 확보)
          map.panTo(position);
          const currentLevel = map.getLevel();
          const targetLevel = 3;
          if (currentLevel <= targetLevel) {
            map.setLevel(targetLevel, { anchor: position });
          } else {
            let step = currentLevel - 1;
            const zoomStep = () => {
              if (step < targetLevel) return;
              map.setLevel(step, { anchor: position, animate: { duration: 180 } });
              step -= 1;
              if (step >= targetLevel) setTimeout(zoomStep, 200);
            };
            zoomStep();
          }
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 0.5, xAnchor: 0.5, zIndex: 10,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

    } else {
      // ━━━ 개별 매물 마커 — 15차-3: 같은 좌표 디듑 (+N 배지), detail/selected 양쪽 반응 ━━━
      const coordGroups = new Map<string, Listing[]>();
      validListings.forEach((l) => {
        // 5자리 반올림(~1m) → 사실상 같은 건물 단위
        const key = `${(l.lat as number).toFixed(5)}_${(l.lng as number).toFixed(5)}`;
        if (!coordGroups.has(key)) coordGroups.set(key, []);
        coordGroups.get(key)!.push(l);
      });

      coordGroups.forEach((group) => {
        // 대표 매물: 선택/디테일 상태가 있으면 그것, 아니면 가장 싼 매물(가격 내림차순 ↓ / deal 기준)
        const selectedInGroup = group.find(l => l.id === selectedId || l.id === detailId);
        const priceOf = (l: Listing) => l.deal === '매매' ? (l.price || 0) : (l.deposit || 0);
        const representative = selectedInGroup ?? [...group].sort((a, b) => priceOf(a) - priceOf(b))[0];
        const extraCount = group.length - 1;

        const listing = representative;
        const position = new window.kakao.maps.LatLng(listing.lat, listing.lng);
        const isSelected = selectedId === listing.id || detailId === listing.id ||
                           group.some(l => l.id === selectedId || l.id === detailId);
        const content = createPriceMarkerContent(listing, isSelected, extraCount);

        content.addEventListener('click', (ev: any) => {
          // 16차 폴리싱 — +N 배지 클릭은 그룹 펼침, 가격버블은 상세
          const target = ev.target as HTMLElement;
          if (target?.closest?.('[data-plus-badge]')) {
            ev.stopPropagation();
            map.panTo(position);
            setExpandedGroup({ lat: listing.lat as number, lng: listing.lng as number, listings: group });
            return;
          }
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
          // 지도 → 리스트 동기화: 리스트 카드 하이라이트·스크롤 (마커 rebuild 없음)
          if (mapHoveredTimerRef.current) clearTimeout(mapHoveredTimerRef.current);
          setMapHoveredId(listing.id);
        });
        content.addEventListener('mouseleave', () => {
          hideHover();
          // flicker 방지: 150ms 후 해제
          if (mapHoveredTimerRef.current) clearTimeout(mapHoveredTimerRef.current);
          mapHoveredTimerRef.current = setTimeout(() => setMapHoveredId(null), 150);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 1.5, xAnchor: 0.5,
          zIndex: isSelected ? 100 : 1,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }
  }, [listings, selectedId, detailId, zoomLevel]);

  // ━━━ T2-3: selectedId 변경 → 리스트 카드 자동 스크롤 ━━━
  useEffect(() => {
    if (!selectedId) return;
    const el = document.querySelector(`[data-listing-id="${selectedId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  // ━━━ 14차: 지도 마커 hover → 리스트 카드 스크롤 + 하이라이트 (다방·직방 스타일) ━━━
  useEffect(() => {
    if (!mapHoveredId) return;
    const el = document.querySelector(`[data-listing-id="${mapHoveredId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mapHoveredId]);

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

  // ━━━ 14차: 검색어 → 카카오 장소/주소 검색 → 지도 실제 이동 (다방·직방 스타일) ━━━
  // 16차 핫픽스 — 엔터/검색 실행 시 매칭되면 지도 이동 후 텍스트 필터를 풀어
  // "지도엔 매물 있는데 리스트는 0건" 현상을 원천 차단
  const handleSearchSubmit = useCallback((q: string) => {
    const query = q.trim();
    if (!query) return;
    if (!window.kakao?.maps || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const moveToCoord = (lat: number, lng: number, level = 4) => {
      const center = new window.kakao.maps.LatLng(lat, lng);
      map.setLevel(level);
      map.panTo(center);
      setSearchQuery('');
    };

    // 1) 주소 검색 (예: "서울 강남구 역삼동")
    if (window.kakao.maps.services?.Geocoder) {
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(query, (result: any[], status: string) => {
        if (status === window.kakao.maps.services.Status.OK && result[0]) {
          moveToCoord(Number(result[0].y), Number(result[0].x), 4);
          setShowSuggestions(false);
          return;
        }
        // 2) 주소 실패 시 장소 키워드 검색 (예: "강남역")
        if (window.kakao.maps.services?.Places) {
          const places = new window.kakao.maps.services.Places();
          places.keywordSearch(query, (data: any[], st: string) => {
            if (st === window.kakao.maps.services.Status.OK && data[0]) {
              moveToCoord(Number(data[0].y), Number(data[0].x), 4);
            }
            setShowSuggestions(false);
          });
        }
      });
    }
  }, []);

  // 15차-3: 지하철역·장소 자동완성 (직방 시그니처) — debounced keywordSearch
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    if (!window.kakao?.maps?.services?.Places) return;
    const timer = setTimeout(() => {
      const places = new window.kakao.maps.services.Places();
      places.keywordSearch(q, (data: any[], st: string) => {
        if (st !== window.kakao.maps.services.Status.OK) {
          setSearchSuggestions([]);
          return;
        }
        // 지하철역·동·장소 등 상위 6건 (카테고리 감지 — 16차 폴리싱)
        const detectCategory = (d: any): 'subway' | 'place' | 'building' | 'address' => {
          const name = String(d.place_name || '');
          const cg = String(d.category_group_code || '');
          const cat = String(d.category_name || '');
          // 지하철역 (카테고리 그룹 SW8 또는 이름 끝 "역")
          if (cg === 'SW8' || /역$/.test(name) || /지하철/.test(cat)) return 'subway';
          // 동·읍·면 (주소성 이름)
          if (/(동|읍|면|리)$/.test(name) && !d.road_address_name) return 'address';
          // 아파트·빌딩·오피스텔
          if (/(아파트|빌딩|오피스텔|타워|프라자|센터|하우스|빌라)/.test(name) || /아파트/.test(cat)) return 'building';
          return 'place';
        };
        const top = data.slice(0, 6).map((d: any) => ({
          name: d.place_name || '',
          address: d.road_address_name || d.address_name || '',
          lat: Number(d.y),
          lng: Number(d.x),
          category: detectCategory(d),
        }));
        setSearchSuggestions(top);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const applySuggestion = useCallback((s: { name: string; lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const center = new window.kakao.maps.LatLng(s.lat, s.lng);
    map.setLevel(4);
    map.panTo(center);
    // 16차 핫픽스 — 자동완성은 지도 이동 전용. 검색어 텍스트 필터로 남기면
    // 매물 제목/주소에 역/동 이름이 없는 경우 지도엔 N건, 리스트엔 0건인 모순 발생.
    setSearchQuery('');
    setShowSuggestions(false);
  }, []);

  // 15차-3: "위치 그리기" 다각형 검색 — 카카오맵 click 이벤트로 점 누적 + 닫기
  const startDrawMode = useCallback(() => {
    if (!mapInstanceRef.current) return;
    drawPointsRef.current = [];
    setDrawPolygon(null);
    if (drawOverlayRef.current) { drawOverlayRef.current.setMap(null); drawOverlayRef.current = null; }
    setDrawMode(true);
  }, []);

  const cancelDrawMode = useCallback(() => {
    setDrawMode(false);
    drawPointsRef.current = [];
    if (drawOverlayRef.current) { drawOverlayRef.current.setMap(null); drawOverlayRef.current = null; }
    setDrawPolygon(null);
  }, []);

  const finishDrawMode = useCallback(() => {
    const pts = drawPointsRef.current;
    if (pts.length >= 3) {
      setDrawPolygon([...pts]);
    }
    setDrawMode(false);
    if (drawOverlayRef.current) { drawOverlayRef.current.setMap(null); drawOverlayRef.current = null; }
  }, []);

  // 드로우 모드 토글 및 카카오맵 click 리스너 설치
  useEffect(() => {
    if (!mapInstanceRef.current || !window.kakao?.maps) return;
    const map = mapInstanceRef.current;

    if (!drawMode) return;

    // 기존 커서 변경
    const prevCursor = mapRef.current?.style.cursor;
    if (mapRef.current) mapRef.current.style.cursor = 'crosshair';

    const redrawPolyline = () => {
      const pts = drawPointsRef.current;
      if (drawOverlayRef.current) { drawOverlayRef.current.setMap(null); drawOverlayRef.current = null; }
      if (pts.length < 2) return;
      const path = pts.map(p => new window.kakao.maps.LatLng(p.lat, p.lng));
      // 닫힌 다각형처럼 보이도록 path 끝점을 시작점으로 잇는 건 finish 때 처리
      const polyline = new window.kakao.maps.Polyline({
        path,
        strokeWeight: 3,
        strokeColor: '#1b5e20',
        strokeOpacity: 0.95,
        strokeStyle: 'solid',
      });
      polyline.setMap(map);
      drawOverlayRef.current = polyline;
    };

    const clickHandler = (mouseEvent: any) => {
      const latlng = mouseEvent.latLng;
      drawPointsRef.current = [...drawPointsRef.current, { lat: latlng.getLat(), lng: latlng.getLng() }];
      redrawPolyline();
    };
    const dblclickHandler = () => {
      // 더블클릭으로 닫기
      finishDrawMode();
    };
    window.kakao.maps.event.addListener(map, 'click', clickHandler);
    window.kakao.maps.event.addListener(map, 'dblclick', dblclickHandler);

    return () => {
      window.kakao.maps.event.removeListener(map, 'click', clickHandler);
      window.kakao.maps.event.removeListener(map, 'dblclick', dblclickHandler);
      if (mapRef.current) mapRef.current.style.cursor = prevCursor || '';
    };
  }, [drawMode, finishDrawMode]);

  // 그려진 다각형을 지도에 표시
  useEffect(() => {
    if (!drawPolygon || !mapInstanceRef.current || !window.kakao?.maps) return;
    const map = mapInstanceRef.current;
    const path = drawPolygon.map(p => new window.kakao.maps.LatLng(p.lat, p.lng));
    const polygon = new window.kakao.maps.Polygon({
      path,
      strokeWeight: 3,
      strokeColor: '#1b5e20',
      strokeOpacity: 0.9,
      strokeStyle: 'solid',
      fillColor: '#1b5e20',
      fillOpacity: 0.15,
    });
    polygon.setMap(map);
    return () => { polygon.setMap(null); };
  }, [drawPolygon]);

  // 16차 폴리싱 — 다각형 면적 (km²) 계산 (Shoelace + 구면근사)
  const drawPolygonAreaKm2 = useMemo(() => {
    if (!drawPolygon || drawPolygon.length < 3) return 0;
    const R = 6371; // km
    const toRad = (d: number) => (d * Math.PI) / 180;
    let area = 0;
    const n = drawPolygon.length;
    for (let i = 0; i < n; i++) {
      const p1 = drawPolygon[i];
      const p2 = drawPolygon[(i + 1) % n];
      area += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
    }
    return Math.abs((area * R * R) / 2);
  }, [drawPolygon]);

  // ━━━ 14차: 가격대 빠른 프리셋 (전세/월세/매매) ━━━
  type PricePreset = { key: string; label: string; apply: (p: ListingFilter) => ListingFilter };
  const pricePresets: PricePreset[] = useMemo(() => [
    {
      key: 'j1', label: '전세 1억 이하',
      apply: (p) => ({ ...p, deals: ['전세'], maxDeposit: 10000 }),
    },
    {
      key: 'j3', label: '전세 3억 이하',
      apply: (p) => ({ ...p, deals: ['전세'], maxDeposit: 30000 }),
    },
    {
      key: 'j5', label: '전세 5억 이하',
      apply: (p) => ({ ...p, deals: ['전세'], maxDeposit: 50000 }),
    },
    {
      key: 'm50', label: '월세 50 이하',
      apply: (p) => ({ ...p, deals: ['월세'], maxMonthly: 50 }),
    },
    {
      key: 'm80', label: '월세 80 이하',
      apply: (p) => ({ ...p, deals: ['월세'], maxMonthly: 80 }),
    },
    {
      key: 's5', label: '매매 5억 이하',
      apply: (p) => ({ ...p, deals: ['매매'], maxDeposit: 50000 }),
    },
  ], []);

  const applyPreset = useCallback((p: PricePreset) => {
    setFilters((prev) => p.apply(prev));
  }, []);

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
      {/* ━━━ 필터 바 — 2026 미니멀 구조 (17차 모바일: 검색 단독 행 + 컨트롤 행 분리) ━━━ */}
      <div className="bg-white/95 backdrop-blur-xl border-b border-gray-200/70 shrink-0">
        {/* 모바일 Row 0 — 검색 단독 (데스크탑에선 숨김, Row 1과 합쳐짐) */}
        <div className="md:hidden px-3 pt-2 pb-1.5">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-wishes-primary/70" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (searchQuery.trim().length >= 2) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchSuggestions[0]) applySuggestion(searchSuggestions[0]);
                  else handleSearchSubmit(searchQuery);
                }
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="지역 · 지하철역 · 동 (예: 강남역)"
              className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-wishes-primary focus:ring-2 focus:ring-wishes-primary/15 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchSuggestions([]); setShowSuggestions(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                aria-label="검색 초기화"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                {searchSuggestions.map((s, idx) => {
                  const catMap = {
                    subway:   { Icon: Train,      label: '지하철', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                    place:    { Icon: MapPin,     label: '장소',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    building: { Icon: Building2,  label: '건물',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                    address:  { Icon: Navigation, label: '동·지역', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
                  } as const;
                  const { Icon: CatIcon, label: catLabel, cls: catCls } = catMap[s.category] ?? catMap.place;
                  return (
                    <button
                      key={`m-${s.name}-${idx}`}
                      onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                      className="w-full text-left px-3 py-2.5 active:bg-wishes-primary/10 transition-colors flex items-start gap-2 border-b border-gray-100 last:border-b-0"
                    >
                      <CatIcon className="w-3.5 h-3.5 text-wishes-primary/70 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-[1px] rounded-full border shrink-0 ${catCls}`}>{catLabel}</span>
                        </div>
                        {s.address && <div className="text-[11px] text-gray-500 truncate mt-0.5">{s.address}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Row 1 — 데스크탑: 검색 + 거래유형 + 상세필터 + 초기화 + 모바일뷰 / 모바일: 거래유형 + 상세필터 + 모바일뷰 (검색은 Row 0) */}
        <div className="px-3 md:px-4 py-1.5 md:py-2.5 flex items-center gap-2 md:gap-3">
          {/* 검색 입력 — 데스크탑 전용 (모바일은 위에서 이미 렌더) */}
          <div className="hidden md:block relative flex-1 min-w-0 max-w-xl">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-wishes-primary/70" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (searchQuery.trim().length >= 2) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchSuggestions[0]) {
                    applySuggestion(searchSuggestions[0]);
                  } else {
                    handleSearchSubmit(searchQuery);
                  }
                }
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="지역 · 지하철역 · 동 검색 (예: 강남역, 역삼동, 판교)"
              className="w-full pl-9 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-wishes-primary focus:ring-2 focus:ring-wishes-primary/15 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchSuggestions([]); setShowSuggestions(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                aria-label="검색 초기화"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {/* 자동완성 드롭다운 (직방 시그니처 + 16차 카테고리 배지) */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                {searchSuggestions.map((s, idx) => {
                  const catMap = {
                    subway:   { Icon: Train,      label: '지하철', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                    place:    { Icon: MapPin,     label: '장소',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    building: { Icon: Building2,  label: '건물',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                    address:  { Icon: Navigation, label: '동·지역', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
                  } as const;
                  const { Icon: CatIcon, label: catLabel, cls: catCls } = catMap[s.category] ?? catMap.place;
                  return (
                    <button
                      key={`${s.name}-${idx}`}
                      onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                      className="w-full text-left px-3 py-2 hover:bg-wishes-primary/5 active:bg-wishes-primary/10 transition-colors flex items-start gap-2 border-b border-gray-100 last:border-b-0"
                    >
                      <CatIcon className="w-3.5 h-3.5 text-wishes-primary/70 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-semibold text-gray-900 truncate">{s.name}</span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-[1px] rounded-full border shrink-0 ${catCls}`}>{catLabel}</span>
                        </div>
                        {s.address && <div className="text-[11px] text-gray-500 truncate mt-0.5">{s.address}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 거래유형 세그먼트 컨트롤 — 모바일에선 flex-1로 가로 확장, 데스크탑은 컴팩트
              18차: 모바일 터치 타겟 확대 (py-2 → ~40px, 데스크탑 py-1.5 유지) */}
          <div className="flex flex-1 md:flex-none bg-gray-100 rounded-lg p-0.5 shrink-0">
            {dealTypes.map((deal) => {
              const isActive = (filters.deals || []).includes(deal);
              return (
                <button
                  key={deal}
                  onClick={() => toggleDealFilter(deal)}
                  className={`flex-1 md:flex-none px-2.5 md:px-3 py-2 md:py-1.5 text-[12px] font-semibold rounded-md transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-wishes-primary text-white shadow-sm'
                      : 'text-gray-600 hover:text-wishes-primary'
                  }`}
                >
                  {deal}
                </button>
              );
            })}
          </div>

          {/* 상세필터 — 매물유형/면적/층/옵션 등 모든 세부 필터를 이 버튼 하나로 통합
              18차: 모바일 py-2 (터치 타겟), 데스크탑 py-1.5 유지 */}
          <button
            onClick={() => setShowFilterSheet(true)}
            className={`flex items-center gap-1.5 px-3 py-2 md:py-1.5 text-[12px] font-semibold rounded-lg transition-all shrink-0 ${
              activeFilterCount > 0
                ? 'bg-wishes-primary text-white shadow-sm hover:bg-wishes-primary/90'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-wishes-primary/60 hover:text-wishes-primary'
            }`}
            title="상세 필터"
          >
            <SlidersHorizontal className="w-[14px] h-[14px]" />
            <span>상세필터</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 min-w-[18px] px-1 py-0 text-[10px] font-bold bg-white text-wishes-primary rounded-full leading-[16px] tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* 초기화 — 활성 필터 있을 때만 (18차: 모바일 터치 타겟 확대) */}
          {activeFilterCount > 0 && (
            <button
              onClick={resetAllFilters}
              className="flex items-center gap-1 px-2.5 py-2 md:py-1.5 text-[11.5px] font-medium text-gray-500 hover:text-red-600 transition-colors shrink-0"
              title="모든 필터 초기화"
            >
              <X className="w-3.5 h-3.5" />
              <span>초기화</span>
            </button>
          )}

          {/* 모바일 뷰 토글 — 18차: 터치 타겟 py-2.5 (~44px WCAG AA 만족) */}
          <div className="md:hidden flex bg-gray-100 rounded-lg p-0.5 shrink-0" role="tablist" aria-label="지도/목록 전환">
            <button
              onClick={() => setMobileView('map')}
              role="tab"
              aria-selected={mobileView === 'map'}
              className={`flex items-center gap-1 px-3.5 py-2.5 text-[12.5px] rounded-md transition-all ${
                mobileView === 'map' ? 'bg-white shadow-sm text-wishes-primary font-bold' : 'text-gray-500'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /><span>지도</span>
            </button>
            <button
              onClick={() => setMobileView('list')}
              role="tab"
              aria-selected={mobileView === 'list'}
              className={`flex items-center gap-1 px-3.5 py-2.5 text-[12.5px] rounded-md transition-all ${
                mobileView === 'list' ? 'bg-white shadow-sm text-wishes-primary font-bold' : 'text-gray-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /><span>목록</span>
            </button>
          </div>
        </div>

        {/* Row 2 — 활성 칩이 있으면 활성 칩, 없으면 빠른선택 프리셋 (둘 중 하나만)
            18차: 모바일 터치 타겟 py-1.5 (데스크탑 py-[3px] 유지) */}
        {activeChips.length > 0 ? (
          <div className="px-3 md:px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10.5px] font-semibold text-wishes-muted shrink-0 tracking-wider">적용</span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.clear}
                className="flex items-center gap-1 px-2.5 py-1.5 md:py-[3px] text-[11px] font-medium rounded-full bg-wishes-primary/8 text-wishes-primary border border-wishes-primary/15 hover:bg-wishes-primary/15 hover:border-wishes-primary/30 transition-all whitespace-nowrap"
              >
                <span>{chip.label}</span>
                <X className="w-2.5 h-2.5 opacity-60" />
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 md:px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10.5px] font-semibold text-wishes-muted shrink-0 tracking-wider">빠른선택</span>
            {pricePresets.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1.5 md:py-[3px] text-[11px] font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:border-wishes-primary/40 hover:bg-wishes-primary/5 hover:text-wishes-primary transition-all whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
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
                      className={`cursor-pointer rounded-lg transition-all ${
                        detailId === listing.id
                          ? 'ring-2 ring-wishes-primary bg-wishes-primary/5'
                          : selectedId === listing.id
                            ? 'ring-2 ring-wishes-secondary/70 bg-wishes-secondary/5'
                            : mapHoveredId === listing.id
                              ? 'ring-2 ring-wishes-secondary/40 bg-wishes-secondary/[0.04]'
                              : ''
                      }`}
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

          {/* 줌 레벨 표시 + 매물 카운트 — 17차 모바일: 1행 컴팩트 pill, 데스크탑은 2단 */}
          {!loading && mapReady && (
            <div className="absolute top-3 md:top-4 left-3 md:left-4 flex flex-col gap-1.5 md:gap-2 z-20">
              <div className="bg-white/95 backdrop-blur-md px-2.5 md:px-3 py-1 md:py-1.5 rounded-full shadow-md text-[11px] md:text-xs font-medium text-gray-700 flex items-center gap-1.5 md:gap-2">
                <span className="hidden sm:inline">현재 지도 영역</span>
                <span className="sm:hidden">영역</span>
                <strong className="text-wishes-primary tabular-nums">{total}</strong>건
              </div>
              <div className="hidden md:flex bg-white/90 backdrop-blur-md px-3 py-1 rounded-full shadow text-[10px] font-semibold text-wishes-muted items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  zoomLevel >= 9 ? 'bg-green-700' :
                  zoomLevel >= 7 ? 'bg-blue-500' :
                  zoomLevel >= 5 ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                {zoomLevelLabel} 단위 표시
              </div>
            </div>
          )}

          {/* 16차: 활성 필터 칩 — 지도 위 상시 노출 (17차 모바일: 하단으로 이동해 상단 컨트롤 겹침 방지) */}
          {mapReady && activeChips.length > 0 && (
            <div className="absolute bottom-36 md:bottom-auto md:top-4 left-1/2 -translate-x-1/2 z-20 max-w-[90%] md:max-w-[60%] flex items-center gap-1.5 overflow-x-auto no-scrollbar px-3 py-2 bg-white/95 backdrop-blur-md rounded-full shadow-md border border-gray-100 animate-fade-in">
              <span className="text-[10.5px] font-bold text-wishes-primary tracking-wider shrink-0">필터</span>
              {activeChips.slice(0, 6).map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.clear}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-semibold rounded-full bg-wishes-primary text-white hover:bg-wishes-primary/80 transition-all whitespace-nowrap shrink-0"
                  title="클릭하여 제거"
                >
                  <span>{chip.label}</span>
                  <X className="w-2.5 h-2.5 opacity-80" />
                </button>
              ))}
              {activeChips.length > 6 && (
                <span className="text-[10px] font-bold text-wishes-muted shrink-0">+{activeChips.length - 6}</span>
              )}
              <button
                onClick={resetAllFilters}
                className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full text-red-500 hover:bg-red-50 shrink-0"
              >
                전체해제
              </button>
            </div>
          )}

          {/* 15차-3: 자동검색 토글 + 위치 그리기 — 우상단 스택 (17차 모바일: 컴팩트 레이블) */}
          {mapReady && (
            <div className="absolute top-3 md:top-4 right-3 md:right-4 z-20 flex flex-col gap-1.5 md:gap-2 items-end">
              {/* 자동검색 ON/OFF 토글 pill */}
              <div className={`flex items-center gap-1.5 md:gap-2 backdrop-blur-md px-2.5 md:px-3 py-1 md:py-1.5 rounded-full shadow-md text-[11px] border transition-all ${
                autoRefetch
                  ? 'bg-white/95 border-gray-100'
                  : 'bg-amber-50/95 border-amber-300 ring-2 ring-amber-200/50'
              }`}>
                <span className={`font-semibold ${autoRefetch ? 'text-gray-700' : 'text-amber-800'}`}>
                  <span className="hidden sm:inline">{autoRefetch ? '이동 시 자동검색' : '자동검색 OFF'}</span>
                  <span className="sm:hidden">{autoRefetch ? '자동' : 'OFF'}</span>
                </span>
                <button
                  onClick={() => setAutoRefetch((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${autoRefetch ? 'bg-wishes-primary' : 'bg-amber-500'}`}
                  aria-label="자동검색 토글"
                  aria-pressed={autoRefetch}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoRefetch ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {/* 위치 그리기 컨트롤 */}
              {!drawMode && !drawPolygon && (
                <button
                  onClick={startDrawMode}
                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 bg-white border border-gray-200 rounded-full shadow-md text-[11.5px] font-bold text-gray-700 hover:bg-wishes-primary hover:text-white hover:border-wishes-primary transition-all"
                  title="지도에 다각형을 그려 해당 영역 매물만 검색"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">위치 그리기</span>
                  <span className="sm:hidden">그리기</span>
                </button>
              )}
              {drawMode && (
                <div className="flex flex-col gap-2 bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-lg border border-wishes-primary/30">
                  <div className="text-[10.5px] font-bold text-wishes-primary text-center px-1">
                    지도를 클릭해 영역을 그리고<br />더블클릭 or 완료
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={finishDrawMode}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-wishes-primary text-white rounded-full text-[11.5px] font-bold hover:bg-wishes-primary/90"
                    >
                      <Check className="w-3.5 h-3.5" />완료
                    </button>
                    <button
                      onClick={cancelDrawMode}
                      className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[11.5px] font-bold text-gray-600 hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
              {!drawMode && drawPolygon && (
                <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-wishes-primary/30 rounded-full shadow-md pl-3 pr-1 py-1 animate-fade-in">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <Edit3 className="w-3.5 h-3.5 text-wishes-primary" />
                    <span className="text-wishes-primary">영역 내</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-wishes-primary text-white tabular-nums">
                      {filteredListings.length}건
                    </span>
                    {drawPolygonAreaKm2 > 0 && (
                      <span className="text-wishes-muted tabular-nums">
                        · {drawPolygonAreaKm2 < 1
                          ? `${(drawPolygonAreaKm2 * 1_000_000).toFixed(0)}㎡`
                          : `${drawPolygonAreaKm2.toFixed(2)}㎢`}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setDrawPolygon(null); }}
                    className="flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="그린 영역을 해제"
                    aria-label="영역 해제"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 15차-3: 수동 재검색 플로팅 버튼 — 자동검색 OFF + 지도 이동 시 강조 (17차: 모바일 bottom, 데스크탑 top) */}
          {!autoRefetch && mapMovedSinceFetch && mapReady && !loading && (
            <button
              onClick={() => fetchBoundsRef.current?.()}
              className="absolute bottom-24 md:bottom-auto md:top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-wishes-primary text-white px-5 py-3 md:py-2.5 rounded-full shadow-2xl text-[13px] font-bold hover:bg-wishes-primary/90 animate-fade-in group"
            >
              <span className="absolute inset-0 rounded-full bg-wishes-primary animate-ping opacity-40 pointer-events-none" />
              <RefreshCw className="w-4 h-4 relative group-hover:rotate-180 transition-transform duration-500" />
              <span className="relative">이 지역에서 재검색</span>
            </button>
          )}

          {/* 16차 폴리싱 — +N 배지 클릭 시 같은 좌표 매물 그룹 펼침 팝업 */}
          {expandedGroup && (
            <>
              <div
                className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-30 animate-fade-in"
                onClick={() => setExpandedGroup(null)}
              />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[min(92vw,360px)] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-wishes-primary/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-wishes-primary" />
                    <span className="text-[13px] font-bold text-wishes-primary">
                      같은 위치 {expandedGroup.listings.length}개 매물
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedGroup(null)}
                    className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                    aria-label="닫기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                  {expandedGroup.listings.map((l) => {
                    const dealCls = l.deal === '매매' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : l.deal === '전세' ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : l.deal === '단기' ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-orange-50 text-orange-700 border-orange-200';
                    const priceLabel = l.deal === '매매'
                      ? `매매 ${((l.price || 0) / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`
                      : l.deal === '전세'
                        ? `전세 ${((l.deposit || 0) / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`
                        : `${l.deal} ${((l.deposit || 0) / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억/${l.monthly || 0}`;
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          setDetailId(l.id);
                          setSelectedId(l.id);
                          setExpandedGroup(null);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-wishes-primary hover:bg-wishes-primary/5 transition-all text-left group"
                      >
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${dealCls}`}>
                          {l.deal}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-bold text-gray-900 truncate">{priceLabel}</div>
                          <div className="text-[11px] text-wishes-muted truncate mt-0.5">
                            {l.type || '매물'}{l.area ? ` · ${l.area}㎡` : ''}{l.floor ? ` · ${l.floor}층` : ''}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-wishes-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          상세 →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
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

        {/* 모바일 상세 패널 (전체화면 오버레이) — 17차: 헤더 아래 전체영역 사용 */}
        {detailId && (
          <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-white animate-fade-in overflow-y-auto">
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
