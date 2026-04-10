'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createAuthClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Listing {
  id: string;
  address: string;
  dong?: string;
  type?: string;
  deal?: string;
  deposit?: number;
  monthly?: number;
  price?: number;
  area_m2?: number;
  floor_current?: number;
  floor_total?: number;
  bathrooms?: number;
  rooms?: string;
  parking?: boolean;
  elevator?: boolean;
  built_year?: string;
  direction?: string;
  images?: string[];
  lat?: number;
  lng?: number;
  description?: string;
  created_at?: string;
  views?: number;
  video?: string;
  pet?: boolean;
  short_term?: boolean;
  balcony?: boolean;
  negotiable?: boolean;
  loan_available?: boolean;
  full_option?: boolean;
  empty?: boolean;
  building_photo?: boolean;
  interior_photo?: boolean;
  maintenance_fee?: number;
}

interface AuthUser {
  id?: string;
  email?: string;
  company?: string;
  role?: string;
  status?: string;
  name?: string;
}

interface FilterState {
  selectedRegions: string[];
  selectedDongs: string[];
  addrType: 'all' | 'district' | 'jibun';
  types: string[];
  deals: string[];
  floor: string;
  roomCount: string[];
  roomShape: string;
  builtYear: string;
  direction: string;
  parking: string;
  livingSize: string;
  keyword: string;
  minDeposit: string;
  maxDeposit: string;
  minMonthly: string;
  maxMonthly: string;
  minSalePrice: string;
  maxSalePrice: string;
  minArea: string;
  maxArea: string;
  areaUnit: 'm2' | 'pyeong';
  sortBy: string;
  page: number;
  perPage: number;
  checks: {
    buildingPhoto: boolean;
    interiorPhoto: boolean;
    video: boolean;
    shortTerm: boolean;
    parkingAvailable: boolean;
    emptyNow: boolean;
    balcony: boolean;
    fullOptionOnly: boolean;
    elevator: boolean;
    priceNego: boolean;
    loanAvailable: boolean;
  };
}

const REGIONS: Record<string, string[]> = {
  '전국': [],
  '서울': [
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구',
    '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구',
    '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구',
    '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
  ],
  '경기': [
    '가평군', '고양시', '과천시', '광명시', '광주시', '구리시',
    '군포시', '김포시', '남양주시', '동두천시', '부천시', '성남시',
    '수원시', '순천시', '시흥시', '안산시', '안성시', '안양시',
    '양주시', '양평군', '여주시', '연천군', '오산시', '용인시',
    '의왕시', '의정부시', '이천시', '파주시', '평택시', '포천시',
    '하남시', '화성시'
  ],
};

const TYPES = ['전체', '원룸', '오피스텔', '아파트', '사무실', '상가', '빌라', '토지'];
const DEALS = ['전체', '월세', '전세', '전월세', '매매'];
const FLOORS = ['전체', '지상', '지하', '반지하', '옥탑', '단독'];
const ROOMS = ['전체', '1개', '1.5개', '1-2개', '2개', '2-3개', '3개'];
const DIRECTIONS = ['전체', '남향', '남동향', '남서향', '동향', '서향', '북향', '북동향', '북서향'];
const PARKING = ['전체', '1대 이상', '2대 이상', '3대 이상', '4대 이상', '5대 이상'];
const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'views', label: '조회순' },
  { value: 'price_low', label: '가격낮음순' },
  { value: 'price_high', label: '가격높음순' },
  { value: 'area_low', label: '면적작은순' },
  { value: 'area_high', label: '면적큰순' }
];

function formatSinglePrice(value: number | undefined): string {
  if (!value || value === 0) return '-';
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const man = value % 10000;
    return man > 0 ? `${eok}억${man}` : `${eok}억`;
  }
  return `${value}만`;
}

function formatPrice(deposit: number | undefined, monthly: number | undefined, price: number | undefined, deal: string | undefined): string {
  if (deal === '매매') return formatSinglePrice(price);
  if (deal === '전세') return formatSinglePrice(deposit);
  if (deal === '월세' || deal === '전월세') {
    const dep = formatSinglePrice(deposit);
    const mon = formatSinglePrice(monthly);
    return `${dep}/${mon}`;
  }
  return '-';
}

function m2ToPy(m2: number | undefined): number {
  return m2 ? Math.round(m2 / 3.30579 * 10) / 10 : 0;
}

function formatArea(m2: number | undefined): string {
  if (!m2) return '-';
  return `${m2}㎡`;
}

function getTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주전`;
  return `${Math.floor(diffDays / 30)}개월전`;
}

export default function SearchPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'loading' | 'nosession' | 'pending' | 'denied' | 'ok' | 'error'>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(true);
  const [hideImages, setHideImages] = useState(false);
  const [detailModal, setDetailModal] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    selectedRegions: [],
    selectedDongs: [],
    addrType: 'all',
    types: [],
    deals: [],
    floor: '전체',
    roomCount: [],
    roomShape: '전체',
    builtYear: '전체',
    direction: '전체',
    parking: '전체',
    livingSize: '전체',
    keyword: '',
    minDeposit: '',
    maxDeposit: '',
    minMonthly: '',
    maxMonthly: '',
    minSalePrice: '',
    maxSalePrice: '',
    minArea: '',
    maxArea: '',
    areaUnit: 'm2',
    sortBy: 'latest',
    page: 1,
    perPage: 50,
    checks: {
      buildingPhoto: false,
      interiorPhoto: false,
      video: false,
      shortTerm: false,
      parkingAvailable: false,
      emptyNow: false,
      balcony: false,
      fullOptionOnly: false,
      elevator: false,
      priceNego: false,
      loanAvailable: false,
    },
  });

  const cacheKey = 'wishes_listings_cache';

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const client = createAuthClient();
        const { data } = await client.auth.getSession();
        if (!data.session) {
          setAuthState('nosession');
          return;
        }
        setAuthState('pending');
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!res.ok) {
          setAuthState('denied');
          return;
        }
        const userData = await res.json();
        setUser(userData.user);
        setAuthState('ok');
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuthState('error');
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (authState !== 'ok') return;
    const loadListings = async () => {
      setLoading(true);
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const cachedData = JSON.parse(cached);
            setListings(cachedData);
          } catch {}
        }
        const res = await fetch('/api/admin/listings?fields=minimal', {
          headers: { Authorization: 'Bearer wishes2026' },
        });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data.listings || [];
          setListings(items);
          localStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } catch (err) {
        console.error('Failed to load listings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadListings();
    try {
      const favs = JSON.parse(localStorage.getItem('ws-favorites') || '[]');
      setFavorites(new Set(favs));
    } catch {}
  }, [authState]);

  useEffect(() => {
    let result = listings.slice();
    if (filters.selectedRegions.length > 0) {
      result = result.filter(l => {
        const addr = l.address || '';
        return filters.selectedRegions.some(r => addr.includes(r)) ||
               filters.selectedDongs.some(d => addr.includes(d));
      });
    }
    if (filters.types.length > 0 && !filters.types.includes('전체')) {
      result = result.filter(l => filters.types.includes(l.type || ''));
    }
    if (filters.deals.length > 0 && !filters.deals.includes('전체')) {
      result = result.filter(l => filters.deals.includes(l.deal || ''));
    }
    if (filters.floor !== '전체') {
      result = result.filter(l => {
        const fc = l.floor_current?.toString() || '';
        if (filters.floor === '지상') return parseInt(fc) > 0;
        if (filters.floor === '지하') return parseInt(fc) < 0;
        return true;
      });
    }
    if (filters.roomCount.length > 0) {
      result = result.filter(l => filters.roomCount.some(r => (l.rooms || '').includes(r)));
    }
    if (filters.direction !== '전체') {
      result = result.filter(l => l.direction === filters.direction);
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      result = result.filter(l => {
        const addr = (l.address || '').toLowerCase();
        const desc = (l.description || '').toLowerCase();
        return addr.includes(kw) || desc.includes(kw);
      });
    }
    if (filters.minArea) {
      const min = parseFloat(filters.minArea);
      result = result.filter(l => (l.area_m2 || 0) >= min);
    }
    if (filters.maxArea) {
      const max = parseFloat(filters.maxArea);
      result = result.filter(l => (l.area_m2 || 0) <= max);
    }
    if (filters.minDeposit) {
      const min = parseFloat(filters.minDeposit);
      result = result.filter(l => (l.deposit || 0) >= min);
    }
    if (filters.maxDeposit) {
      const max = parseFloat(filters.maxDeposit);
      result = result.filter(l => (l.deposit || 0) <= max);
    }
    if (filters.checks.elevator) {
      result = result.filter(l => l.elevator);
    }
    result.sort((a, b) => {
      if (filters.sortBy === 'latest') {
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
      }
      if (filters.sortBy === 'views') {
        return (b.views || 0) - (a.views || 0);
      }
      if (filters.sortBy === 'price_low') {
        const aPrice = a.price || a.deposit || 0;
        const bPrice = b.price || b.deposit || 0;
        return aPrice - bPrice;
      }
      if (filters.sortBy === 'price_high') {
        const aPrice = a.price || a.deposit || 0;
        const bPrice = b.price || b.deposit || 0;
        return bPrice - aPrice;
      }
      if (filters.sortBy === 'area_low') {
        return (a.area_m2 || 0) - (b.area_m2 || 0);
      }
      if (filters.sortBy === 'area_high') {
        return (b.area_m2 || 0) - (a.area_m2 || 0);
      }
      return 0;
    });
    setFilteredListings(result);
    setFilters(prev => ({ ...prev, page: 1 }));
  }, [listings, filters]);

  const toggleFavorite = (id: string) => {
    const newFavs = new Set(favorites);
    if (newFavs.has(id)) {
      newFavs.delete(id);
    } else {
      newFavs.add(id);
    }
    setFavorites(newFavs);
    localStorage.setItem('ws-favorites', JSON.stringify([...newFavs]));
  };

  const paginatedListings = useMemo(() => {
    const start = (filters.page - 1) * filters.perPage;
    return filteredListings.slice(start, start + filters.perPage);
  }, [filteredListings, filters.page, filters.perPage]);

  const totalPages = Math.ceil(filteredListings.length / filters.perPage);

  const handleLogout = async () => {
    try {
      const client = createAuthClient();
      await client.auth.signOut();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '14px', color: '#666' }}>
        🔄 인증 정보를 확인 중입니다...
      </div>
    );
  }

  if (authState === 'nosession') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🔐</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#2D5A27' }}>로그인 필요</div>
        <div style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>이 페이지는 로그인한 사용자만 접근할 수 있습니다.</div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '10px 24px',
              background: '#2D5A27',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            로그인
          </button>
          <button
            onClick={() => router.push('/signup')}
            style={{
              padding: '10px 24px',
              background: '#f0f4f0',
              color: '#2D5A27',
              border: '1px solid #2D5A27',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            회원가입
          </button>
        </div>
      </div>
    );
  }

  if (authState === 'pending' || authState === 'denied' || authState === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#333' }}>
          {authState === 'error' ? '오류가 발생했습니다' : '접근이 제한되었습니다'}
        </div>
        <div style={{ fontSize: '13px', color: '#666' }}>
          {authState === 'pending' ? '승인 대기 중입니다' : '관리자 승인을 받은 계정만 이용할 수 있습니다'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif', backgroundColor: '#F0F4F0', minHeight: '100vh', color: '#333' }}>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif; }
        input, select { font-family: inherit; font-size: 12px; }
        .ws-search-container { font-size: 13px; line-height: 1.45; }
        .ws-header { background: linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%); color: #fff; padding: 10px 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .ws-header .ws-title { font-size: 18px; font-weight: 700; white-space: nowrap; }
        .ws-header-user { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 12px; }
        .ws-header-logout { padding: 6px 14px; background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
        .ws-view-tabs { display: flex; gap: 0; background: #fff; border-bottom: 2px solid #eee; }
        .ws-tab { padding: 5px 14px; border: none; border-bottom: 2px solid transparent; background: #fff; cursor: pointer; font-size: 12px; font-weight: 500; color: #888; margin-bottom: -2px; }
        .ws-tab-active { color: #2D5A27; border-bottom-color: #2D5A27; font-weight: 700; background: #f8faf8; }
        .ws-addr-section { background: #fff; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
        .ws-region-tabs { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 6px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
        .ws-region-tab { padding: 5px 12px; border: none; border-right: 1px solid #eee; background: #fff; cursor: pointer; font-size: 12px; color: #555; }
        .ws-region-tab:last-child { border-right: none; }
        .ws-region-tab-active { background: #2D5A27; color: #fff; }
        .ws-districts { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 3px; margin: 6px 0; }
        .ws-district-btn { padding: 4px 6px; border: 1px solid #e8e8e8; background: #fafafa; cursor: pointer; font-size: 12px; color: #555; text-align: center; border-radius: 3px; }
        .ws-district-btn-selected { background: #2D5A27; color: #fff; border-color: #2D5A27; font-weight: 600; }
        .ws-selected-tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
        .ws-tag { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; background: #E8F5E9; border-radius: 10px; font-size: 11px; color: #2D5A27; font-weight: 600; }
        .ws-tag-close { background: none; border: none; cursor: pointer; font-size: 13px; color: #888; padding: 0; }
        .ws-filters-section { background: #fff; border-bottom: 1px solid #ddd; }
        .ws-filters-toggle { padding: 6px 12px; background: #f5f7f5; border: 1px solid #ddd; border-bottom: none; cursor: pointer; font-size: 12px; font-weight: 600; color: #2D5A27; width: 100%; text-align: left; }
        .ws-filter-grid { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid #ddd; background: #fff; }
        .ws-filter-col { border-right: 1px solid #e8e8e8; min-width: 0; }
        .ws-filter-col:last-child { border-right: none; }
        .ws-filter-col-header { background: #f5f7f5; padding: 5px 8px; font-weight: 700; font-size: 12px; color: #333; border-bottom: 1px solid #ddd; text-align: center; white-space: nowrap; }
        .ws-filter-col-body { display: flex; flex-direction: column; max-height: 180px; overflow-y: auto; }
        .ws-fchip { display: block; width: 100%; text-align: left; padding: 3px 8px; border: none; border-bottom: 1px solid #f0f0f0; background: #fff; cursor: pointer; font-size: 12px; color: #555; white-space: nowrap; }
        .ws-fchip:last-child { border-bottom: none; }
        .ws-fchip:hover { background: #e8f5e9; color: #2D5A27; }
        .ws-fchip-active { background: #2D5A27; color: #fff; font-weight: 600; }
        .ws-filter-hrow { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 1px solid #ddd; border-top: none; background: #fff; flex-wrap: wrap; }
        .ws-filter-hrow > label { min-width: 50px; font-size: 12px; font-weight: 700; color: #2D5A27; flex-shrink: 0; }
        .ws-input { padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
        .ws-checkbox-group { display: flex; flex-wrap: wrap; gap: 6px 12px; }
        .ws-checkbox-label { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: #555; cursor: pointer; }
        .ws-results-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background: #f8f8f8; border-bottom: 1px solid #ddd; flex-wrap: wrap; gap: 4px; }
        .ws-result-count { font-size: 12px; color: #333; font-weight: 600; }
        .ws-result-count strong { color: #2D5A27; font-size: 14px; }
        .ws-select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff; cursor: pointer; }
        .ws-listings { padding: 0; background: #fff; }
        .ws-address-group { border: 1px solid #d4e8d0; border-radius: 6px; margin: 4px 3px; overflow: hidden; background: #fff; }
        .ws-group-header { display: flex; align-items: center; gap: 6px; padding: 5px 10px; background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%); cursor: pointer; user-select: none; border-bottom: 1px solid #d4e8d0; }
        .ws-group-arrow { font-size: 10px; color: #2D5A27; width: 14px; text-align: center; font-weight: 700; }
        .ws-group-title { font-size: 12px; font-weight: 600; color: #2D5A27; flex: 1; }
        .ws-group-count { font-size: 10px; font-weight: 700; color: #fff; background: #2D5A27; padding: 1px 6px; border-radius: 10px; }
        .ws-listing-card { display: flex; flex-wrap: wrap; align-items: stretch; background: #fff; border-bottom: 1px solid #eee; min-height: 120px; }
        .ws-listing-card:hover { background: #fafff9; }
        .ws-listing-checkbox { margin: 0 4px 0 8px; accent-color: #2D5A27; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer; align-self: center; }
        .ws-listing-image-wrap { width: 110px; height: 110px; position: relative; flex-shrink: 0; overflow: hidden; border-right: 1px solid #f0f0f0; align-self: center; background: #f5f5f5; border-radius: 4px; margin: 6px 0 6px 6px; }
        .ws-listing-image { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ws-photo-badge { position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.6); color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
        .ws-time-badge { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6); color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
        .ws-favorite-btn { position: absolute; top: 4px; right: 4px; background: rgba(255,255,255,0.85); border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 13px; color: #ccc; display: flex; align-items: center; justify-content: center; }
        .ws-favorite-btn-active { color: #FF9800; background: #FFF3E0; }
        .ws-listing-content { flex: 1; padding: 10px 12px; min-width: 0; display: flex; gap: 12px; align-items: stretch; }
        .ws-card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
        .ws-listing-addr { font-size: 13.5px; font-weight: 700; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-listing-title { font-size: 13.5px; font-weight: 700; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .ws-listing-title:hover { color: #2D5A27; text-decoration: underline; }
        .ws-listing-subtitle { font-size: 11.5px; color: #888; }
        .ws-listing-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0 0; }
        .ws-tag-small { padding: 2px 7px; background: #f7f7f7; border: 1px solid #eaeaea; border-radius: 3px; font-size: 11px; color: #666; white-space: nowrap; }
        .ws-card-right { flex-shrink: 0; width: 175px; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; padding: 8px 0 8px 12px; border-left: 1px solid #f0f0f0; }
        .ws-card-price-block { text-align: right; }
        .ws-deal-type { font-size: 11px; font-weight: 700; color: #E65100; background: #FFF3E0; padding: 1px 6px; border-radius: 3px; display: inline-block; }
        .ws-price-main { font-size: 17px; font-weight: 800; color: #2D5A27; white-space: nowrap; margin-top: 2px; }
        .ws-maintenance { font-size: 10px; color: #aaa; }
        .ws-card-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; width: 100%; }
        .ws-detail-btn { padding: 4px 0; border-radius: 4px; border: 1px solid #2D5A27; background: #fff; cursor: pointer; font-size: 10.5px; font-weight: 600; color: #2D5A27; width: 100%; }
        .ws-detail-btn:hover { background: #2D5A27; color: #fff; }
        .ws-pagination { display: flex; justify-content: center; gap: 2px; padding: 6px; background: #fff; border-top: 1px solid #eee; flex-wrap: wrap; }
        .ws-page-btn { min-width: 28px; height: 28px; border-radius: 4px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
        .ws-page-btn-active { background: #2D5A27; color: #fff; border-color: #2D5A27; }
        .ws-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; justify-content: center; align-items: flex-start; padding: 30px 16px; overflow-y: auto; }
        .ws-modal-content { background: #fff; border-radius: 12px; max-width: 680px; width: 100%; padding: 24px; position: relative; box-shadow: 0 16px 48px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .ws-modal-close { position: absolute; top: 10px; right: 14px; background: none; border: none; font-size: 26px; cursor: pointer; color: #999; }
        .ws-detail-header { margin-bottom: 12px; }
        .ws-detail-header h2 { font-size: 18px; font-weight: 700; color: #333; margin-bottom: 4px; }
        .ws-detail-header p { font-size: 12px; color: #888; }
        .ws-detail-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #eee; }
        .ws-detail-section h3 { font-size: 14px; font-weight: 700; color: #2D5A27; margin-bottom: 8px; }
        .ws-detail-section p { font-size: 12px; color: #555; line-height: 1.6; }
        .ws-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .ws-detail-grid > div { font-size: 12px; color: #555; padding: 3px 0; }
        .ws-detail-grid strong { color: #333; margin-right: 4px; }
        .ws-no-results { text-align: center; padding: 40px 16px; color: #999; font-size: 14px; }
      `}</style>

      <div className="ws-search-container">
        <div className="ws-header">
          <div className="ws-title">🔍 중개사 포털 - 매물검색</div>
          <div className="ws-header-user">
            <span>{user?.name || user?.email || 'Admin'}</span>
            {user?.company && <span>({user.company})</span>}
            <button className="ws-header-logout" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className="ws-view-tabs">
          <button
            className={`ws-tab ${viewMode === 'list' ? 'ws-tab-active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            📋 목록
          </button>
          <button
            className={`ws-tab ${viewMode === 'grid' ? 'ws-tab-active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            🔲 격자
          </button>
          <button
            className={`ws-tab ${viewMode === 'map' ? 'ws-tab-active' : ''}`}
            onClick={() => setViewMode('map')}
          >
            📍 지도
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '10px' }}>
            <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={hideImages}
                onChange={() => setHideImages(!hideImages)}
                style={{ accentColor: '#2D5A27' }}
              />
              이미지숨김
            </label>
          </div>
        </div>

        <div className="ws-addr-section">
          <div className="ws-region-tabs">
            {Object.keys(REGIONS).map(region => (
              <button
                key={region}
                className={`ws-region-tab ${filters.selectedRegions.includes(region) ? 'ws-region-tab-active' : ''}`}
                onClick={() => {
                  setFilters(prev => ({
                    ...prev,
                    selectedRegions: prev.selectedRegions.includes(region)
                      ? prev.selectedRegions.filter(r => r !== region)
                      : [...prev.selectedRegions, region],
                    selectedDongs: [],
                  }));
                }}
              >
                {region}
              </button>
            ))}
          </div>

          {filters.selectedRegions.length > 0 && REGIONS[filters.selectedRegions[0]] && (
            <div className="ws-districts">
              {REGIONS[filters.selectedRegions[0]].map(dong => (
                <button
                  key={dong}
                  className={`ws-district-btn ${filters.selectedDongs.includes(dong) ? 'ws-district-btn-selected' : ''}`}
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      selectedDongs: prev.selectedDongs.includes(dong)
                        ? prev.selectedDongs.filter(d => d !== dong)
                        : [...prev.selectedDongs, dong],
                    }));
                  }}
                >
                  {dong}
                </button>
              ))}
            </div>
          )}

          {filters.selectedDongs.length > 0 && (
            <div className="ws-selected-tags">
              {filters.selectedDongs.map(dong => (
                <div key={dong} className="ws-tag">
                  {dong}
                  <button
                    className="ws-tag-close"
                    onClick={() => {
                      setFilters(prev => ({
                        ...prev,
                        selectedDongs: prev.selectedDongs.filter(d => d !== dong),
                      }));
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ws-filters-section">
          <button
            className="ws-filters-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? '▼' : '▶'} 상세필터
          </button>

          {showFilters && (
            <>
              <div className="ws-filter-grid">
                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">매물유형</div>
                  <div className="ws-filter-col-body">
                    {TYPES.map(t => (
                      <button
                        key={t}
                        className={`ws-fchip ${filters.types.includes(t) || (t === '전체' && filters.types.length === 0) ? 'ws-fchip-active' : ''}`}
                        onClick={() => {
                          if (t === '전체') {
                            setFilters(prev => ({ ...prev, types: [] }));
                          } else {
                            setFilters(prev => ({
                              ...prev,
                              types: prev.types.includes(t)
                                ? prev.types.filter(x => x !== t)
                                : [...prev.types, t],
                            }));
                          }
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">거래유형</div>
                  <div className="ws-filter-col-body">
                    {DEALS.map(d => (
                      <button
                        key={d}
                        className={`ws-fchip ${filters.deals.includes(d) || (d === '전체' && filters.deals.length === 0) ? 'ws-fchip-active' : ''}`}
                        onClick={() => {
                          if (d === '전체') {
                            setFilters(prev => ({ ...prev, deals: [] }));
                          } else {
                            setFilters(prev => ({
                              ...prev,
                              deals: prev.deals.includes(d)
                                ? prev.deals.filter(x => x !== d)
                                : [...prev.deals, d],
                            }));
                          }
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">층수</div>
                  <div className="ws-filter-col-body">
                    {FLOORS.map(f => (
                      <button
                        key={f}
                        className={`ws-fchip ${filters.floor === f ? 'ws-fchip-active' : ''}`}
                        onClick={() => setFilters(prev => ({ ...prev, floor: f }))}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">방의수</div>
                  <div className="ws-filter-col-body">
                    {ROOMS.map(r => (
                      <button
                        key={r}
                        className={`ws-fchip ${filters.roomCount.includes(r) || (r === '전체' && filters.roomCount.length === 0) ? 'ws-fchip-active' : ''}`}
                        onClick={() => {
                          if (r === '전체') {
                            setFilters(prev => ({ ...prev, roomCount: [] }));
                          } else {
                            setFilters(prev => ({
                              ...prev,
                              roomCount: prev.roomCount.includes(r)
                                ? prev.roomCount.filter(x => x !== r)
                                : [...prev.roomCount, r],
                            }));
                          }
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">방향</div>
                  <div className="ws-filter-col-body">
                    {DIRECTIONS.map(d => (
                      <button
                        key={d}
                        className={`ws-fchip ${filters.direction === d ? 'ws-fchip-active' : ''}`}
                        onClick={() => setFilters(prev => ({ ...prev, direction: d }))}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">주차</div>
                  <div className="ws-filter-col-body">
                    {PARKING.map(p => (
                      <button
                        key={p}
                        className={`ws-fchip ${filters.parking === p ? 'ws-fchip-active' : ''}`}
                        onClick={() => setFilters(prev => ({ ...prev, parking: p }))}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ws-filter-col">
                  <div className="ws-filter-col-header">정렬</div>
                  <div className="ws-filter-col-body">
                    {SORT_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        className={`ws-fchip ${filters.sortBy === s.value ? 'ws-fchip-active' : ''}`}
                        onClick={() => setFilters(prev => ({ ...prev, sortBy: s.value }))}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ws-filter-hrow">
                <label>키워드</label>
                <input
                  type="text"
                  className="ws-input"
                  placeholder="주소, 설명 검색"
                  value={filters.keyword}
                  onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="ws-filter-hrow">
                <label>면적</label>
                <input
                  type="number"
                  className="ws-input"
                  placeholder="최소"
                  value={filters.minArea}
                  onChange={(e) => setFilters(prev => ({ ...prev, minArea: e.target.value }))}
                  style={{ maxWidth: '80px' }}
                />
                <span>~</span>
                <input
                  type="number"
                  className="ws-input"
                  placeholder="최대"
                  value={filters.maxArea}
                  onChange={(e) => setFilters(prev => ({ ...prev, maxArea: e.target.value }))}
                  style={{ maxWidth: '80px' }}
                />
              </div>

              <div className="ws-filter-hrow">
                <label style={{ minWidth: '100%', marginBottom: '8px' }}>옵션</label>
                <div className="ws-checkbox-group">
                  <label className="ws-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.checks.elevator}
                      onChange={(e) =>
                        setFilters(prev => ({
                          ...prev,
                          checks: { ...prev.checks, elevator: e.target.checked },
                        }))
                      }
                    />
                    엘리베이터
                  </label>
                  <label className="ws-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.checks.video}
                      onChange={(e) =>
                        setFilters(prev => ({
                          ...prev,
                          checks: { ...prev.checks, video: e.target.checked },
                        }))
                      }
                    />
                    영상
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ws-results-header">
          <div className="ws-result-count">
            총 <strong>{filteredListings.length}</strong>건
          </div>
          <div>
            <select
              className="ws-select"
              value={filters.perPage}
              onChange={(e) => setFilters(prev => ({ ...prev, perPage: parseInt(e.target.value), page: 1 }))}
            >
              <option value={20}>20개</option>
              <option value={50}>50개</option>
              <option value={100}>100개</option>
            </select>
          </div>
        </div>

        {filteredListings.length === 0 ? (
          <div className="ws-no-results">검색 결과가 없습니다</div>
        ) : (
          <>
            <div className="ws-listings">
              {paginatedListings.map(listing => (
                <div key={listing.id} className="ws-listing-card">
                  {!hideImages && (
                    <div className="ws-listing-image-wrap">
                      {listing.images && listing.images.length > 0 ? (
                        <>
                          <img src={listing.images[0]} alt="" className="ws-listing-image" />
                          {listing.images.length > 1 && <div className="ws-photo-badge">{listing.images.length}</div>}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#ccc' }}>
                          📷
                        </div>
                      )}
                      <button
                        className={`ws-favorite-btn ${favorites.has(listing.id) ? 'ws-favorite-btn-active' : ''}`}
                        onClick={() => toggleFavorite(listing.id)}
                        style={{ border: 'none' }}
                      >
                        ♡
                      </button>
                      {listing.created_at && (
                        <div className="ws-time-badge">{getTimeAgo(listing.created_at)}</div>
                      )}
                    </div>
                  )}

                  <div className="ws-listing-content">
                    <div className="ws-card-info">
                      <p className="ws-listing-addr">{listing.address}</p>
                      <p className="ws-listing-title">{listing.type || ''} {listing.deal || ''}</p>
                      <p className="ws-listing-subtitle">
                        {listing.area_m2 ? `${listing.area_m2}㎡ (${m2ToPy(listing.area_m2)}평)` : ''}
                        {listing.floor_current && ` · ${listing.floor_current}층`}
                        {listing.rooms && ` · ${listing.rooms}`}
                      </p>
                      <div className="ws-listing-tags">
                        {listing.parking && <span className="ws-tag-small">🅿️ 주차</span>}
                        {listing.elevator && <span className="ws-tag-small">🛗 엘리베이터</span>}
                        {listing.balcony && <span className="ws-tag-small">🪟 발코니</span>}
                      </div>
                    </div>

                    <div className="ws-card-right">
                      <div className="ws-card-price-block">
                        <span className="ws-deal-type">{listing.deal}</span>
                        <div className="ws-price-main">{formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal)}</div>
                        {listing.maintenance_fee && (
                          <div className="ws-maintenance">관리비 {formatSinglePrice(listing.maintenance_fee)}</div>
                        )}
                      </div>
                      <div className="ws-card-controls">
                        <button
                          className="ws-detail-btn"
                          onClick={() => setDetailModal(listing)}
                        >
                          상세보기
                        </button>
                        <div style={{ fontSize: '9px', color: '#ccc', cursor: 'pointer' }}>{listing.id}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="ws-pagination">
              <button
                className="ws-page-btn"
                onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={filters.page === 1}
              >
                ◀
              </button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                const startPage = Math.max(1, filters.page - 4);
                const pageNum = startPage + i;
                return (
                  <button
                    key={pageNum}
                    className={`ws-page-btn ${filters.page === pageNum ? 'ws-page-btn-active' : ''}`}
                    onClick={() => setFilters(prev => ({ ...prev, page: pageNum }))}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                className="ws-page-btn"
                onClick={() => setFilters(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                disabled={filters.page === totalPages}
              >
                ▶
              </button>
            </div>
          </>
        )}

        {detailModal && (
          <div className="ws-modal" onClick={() => setDetailModal(null)}>
            <div
              className="ws-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="ws-modal-close" onClick={() => setDetailModal(null)}>
                ✕
              </button>

              <div className="ws-detail-header">
                <h2>{detailModal.address}</h2>
                <p>{detailModal.type} · {detailModal.deal}</p>
              </div>

              <div className="ws-detail-section">
                <h3>가격</h3>
                <div className="ws-detail-grid">
                  <div>
                    <strong>거래유형:</strong> {detailModal.deal}
                  </div>
                  <div>
                    <strong>가격:</strong> {formatPrice(detailModal.deposit, detailModal.monthly, detailModal.price, detailModal.deal)}
                  </div>
                  {detailModal.maintenance_fee && (
                    <div>
                      <strong>관리비:</strong> {formatSinglePrice(detailModal.maintenance_fee)}
                    </div>
                  )}
                </div>
              </div>

              <div className="ws-detail-section">
                <h3>기본 정보</h3>
                <div className="ws-detail-grid">
                  <div>
                    <strong>면적:</strong> {formatArea(detailModal.area_m2)}
                  </div>
                  <div>
                    <strong>층수:</strong> {detailModal.floor_current}층
                  </div>
                  <div>
                    <strong>방:</strong> {detailModal.rooms}
                  </div>
                  <div>
                    <strong>준공년:</strong> {detailModal.built_year}
                  </div>
                  <div>
                    <strong>방향:</strong> {detailModal.direction}
                  </div>
                  <div>
                    <strong>주차:</strong> {detailModal.parking ? '있음' : '없음'}
                  </div>
                </div>
              </div>

              {detailModal.description && (
                <div className="ws-detail-section">
                  <h3>설명</h3>
                  <p>{detailModal.description}</p>
                </div>
              )}

              <div className="ws-detail-section">
                <h3>옵션</h3>
                <div className="ws-listing-tags">
                  {detailModal.elevator && <span className="ws-tag-small">🛗 엘리베이터</span>}
                  {detailModal.balcony && <span className="ws-tag-small">🪟 발코니</span>}
                  {detailModal.pet && <span className="ws-tag-small">🐾 반려동물</span>}
                  {detailModal.video && <span className="ws-tag-small">🎬 영상</span>}
                  {detailModal.negotiable && <span className="ws-tag-small">💬 협상가능</span>}
                  {detailModal.loan_available && <span className="ws-tag-small">💳 대출가능</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
