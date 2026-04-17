'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import MapListingPanel from '@/components/MapListingPanel';
import { formatPrice } from '@/lib/utils';
import { MapPin, List, Loader2, Search, X, Building2, Crosshair, RefreshCw } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';

declare global {
  interface Window {
    kakao: any;
  }
}

const dealTypes: DealType[] = ['전세', '월세', '매매'];
const listingTypes: ListingType[] = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];

const DEFAULT_CENTER = { lat: 37.4847, lng: 126.9293 };
const DEFAULT_ZOOM = 5;

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
// 개별 매물 마커 (Level 1-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createPriceMarkerContent(listing: Listing): HTMLElement {
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
  content.style.cssText = `
    background: ${colors.bg}; border: 2px solid ${colors.border};
    color: ${colors.text}; font-size: 11px; font-weight: 700;
    padding: 4px 10px; border-radius: 20px; white-space: nowrap;
    cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    transform: translate(-50%, -100%);
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
    content.style.transform = 'translate(-50%, -100%) scale(1)';
    content.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
    content.style.zIndex = '';
  });

  return content;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 지도 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function MapSearchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  const { listings, loading, total, fetchListings } = useMapListings();
  const [filters, setFilters] = useState<ListingFilter>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [mapReady, setMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // 검색 필터링된 리스트
  const filteredListings = useMemo(() => {
    if (!searchQuery.trim()) return listings;
    const q = searchQuery.toLowerCase();
    return listings.filter((l) =>
      l.title?.toLowerCase().includes(q) ||
      l.dong?.toLowerCase().includes(q) ||
      (l.address && l.address.toLowerCase().includes(q)) ||
      l.type?.toLowerCase().includes(q) ||
      l.deal?.toLowerCase().includes(q) ||
      String(l.id).includes(q)
    );
  }, [listings, searchQuery]);

  // 줌 레벨 텍스트
  const zoomLevelLabel = useMemo(() => {
    if (zoomLevel >= 9) return '시/도';
    if (zoomLevel >= 7) return '구/군';
    if (zoomLevel >= 5) return '동/읍면';
    return '매물';
  }, [zoomLevel]);

  // ━━━ 카카오맵 초기화 ━━━
  useEffect(() => {
    if (!window.kakao?.maps) {
      console.warn('카카오맵 SDK가 로드되지 않았습니다.');
      setMapReady(true);
      return;
    }

    window.kakao.maps.load(() => {
      if (!mapRef.current) return;

      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: DEFAULT_ZOOM,
      });

      mapInstanceRef.current = map;
      setMapReady(true);

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

      // 줌 레벨 변경 감지
      window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
        setZoomLevel(map.getLevel());
      });

      // idle 이벤트 (이동/줌 완료 후)
      window.kakao.maps.event.addListener(map, 'idle', fetchBounds);

      // 초기 로드
      fetchBounds();
    });
  }, []);

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
    }, filters);
  }, [filters, fetchListings]);

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
          map.setLevel(8, { anchor: position });
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
          map.setLevel(6, { anchor: position });
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
          map.setLevel(4, { anchor: position });
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
        const content = createPriceMarkerContent(listing);

        content.addEventListener('click', () => {
          setDetailId(listing.id);
          setSelectedId(listing.id);
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position, content, yAnchor: 1.5, xAnchor: 0.5,
          zIndex: selectedId === listing.id ? 100 : 1,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }
  }, [listings, selectedId, zoomLevel]);

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
    }, filters);
  }, [fetchListings, filters]);

  // ━━━ 필터 토글 핸들러 ━━━
  const toggleDealFilter = (deal: DealType) => {
    setFilters((prev) => ({
      ...prev,
      deal: prev.deal === deal ? undefined : deal,
    }));
  };

  const toggleTypeFilter = (type: ListingType) => {
    setFilters((prev) => ({
      ...prev,
      type: prev.type === type ? undefined : type,
    }));
  };

  return (
    <div className="pt-20 h-screen flex flex-col">
      {/* ━━━ 다방 스타일 필터 바 ━━━ */}
      <div className="bg-white border-b border-gray-100 shadow-sm shrink-0">
        {/* 1행: 거래유형 + 검색 */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          {/* 거래유형 필터 */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilters((prev) => ({ ...prev, deal: undefined }))}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-full border-2 transition-all whitespace-nowrap ${
                !filters.deal
                  ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              전체
            </button>
            {dealTypes.map((deal) => {
              const dealColors: Record<string, { active: string; ring: string }> = {
                '전세': { active: 'bg-blue-500 border-blue-500', ring: 'hover:border-blue-300 hover:text-blue-600' },
                '월세': { active: 'bg-orange-500 border-orange-500', ring: 'hover:border-orange-300 hover:text-orange-600' },
                '매매': { active: 'bg-emerald-500 border-emerald-500', ring: 'hover:border-emerald-300 hover:text-emerald-600' },
              };
              const c = dealColors[deal] || dealColors['전세'];
              const isActive = filters.deal === deal;

              return (
                <button
                  key={deal}
                  onClick={() => toggleDealFilter(deal)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-full border-2 transition-all whitespace-nowrap ${
                    isActive
                      ? `${c.active} text-white shadow-sm`
                      : `bg-white text-gray-500 border-gray-200 ${c.ring}`
                  }`}
                >
                  {deal}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* 검색 버튼 */}
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
              <span>매물검색</span>
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

        {/* 2행: 매물유형 필터 */}
        <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, type: undefined }))}
            className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all whitespace-nowrap ${
              !filters.type
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            전체
          </button>
          {listingTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggleTypeFilter(type)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all whitespace-nowrap ${
                filters.type === type
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* 3행: 가격대 프리셋 (거래유형 선택 시 노출) */}
        {filters.deal && (
          <div className="px-4 pb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-semibold text-gray-500 shrink-0">
              {filters.deal === '매매' ? '매매가' : filters.deal === '월세' ? '월세' : '보증금'}
            </span>
            {(filters.deal === '매매'
              ? [
                  { label: '5억↓', max: 50000 },
                  { label: '10억↓', max: 100000 },
                  { label: '20억↓', max: 200000 },
                ]
              : filters.deal === '월세'
              ? [
                  { label: '50↓', max: 50 },
                  { label: '100↓', max: 100 },
                  { label: '300↓', max: 300 },
                ]
              : [
                  { label: '1억↓', max: 10000 },
                  { label: '3억↓', max: 30000 },
                  { label: '5억↓', max: 50000 },
                ]
            ).map((p) => {
              const active = filters.maxDeposit === p.max;
              return (
                <button
                  key={p.label}
                  onClick={() => setFilters((prev) => ({
                    ...prev,
                    maxDeposit: active ? undefined : p.max,
                  }))}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all whitespace-nowrap ${
                    active
                      ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-wishes-primary/40 hover:text-wishes-primary'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            {filters.maxDeposit !== undefined && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, maxDeposit: undefined }))}
                className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-wishes-primary shrink-0"
                title="가격 필터 초기화"
              >
                <X className="w-3 h-3 inline" />
              </button>
            )}
          </div>
        )}

        {/* 검색 입력창 (토글) */}
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

      {/* ━━━ 지도 + 리스트 ━━━ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 카카오맵 영역 */}
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

        {/* ━━━ 매물 리스트 (우측 고정) ━━━ */}
        <div className={`${mobileView === 'map' ? 'hidden md:block' : ''} w-full md:w-[380px] bg-white border-l border-gray-200 shrink-0 overflow-y-auto custom-scrollbar`}>
          <div className="p-4 space-y-3">
            {/* 리스트 헤더 */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">
                매물 <strong className="text-wishes-primary">{searchQuery ? filteredListings.length : total}</strong>건
                {searchQuery && (
                  <span className="ml-1 text-xs text-wishes-muted">
                    &quot;{searchQuery}&quot; 검색결과
                  </span>
                )}
              </div>
            </div>

            {/* 매물 카드 리스트 */}
            {filteredListings.length > 0 ? (
              filteredListings.map((listing) => (
                <div
                  key={listing.id}
                  onClick={() => handleListingClick(listing.id)}
                  className={`cursor-pointer rounded-lg transition-all ${detailId === listing.id ? 'ring-2 ring-wishes-primary bg-wishes-primary/5' : ''}`}
                >
                  <ListingCard
                    listing={listing}
                    compact
                    noLink
                    onHover={handleCardHover}
                  />
                </div>
              ))
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

        {/* ━━━ 매물 상세 슬라이드 패널 (데스크탑: 지도 위 오버레이 / 모바일: 전체화면) ━━━ */}
        <div
          className={`hidden md:block absolute top-0 bottom-0 right-[380px] z-30 bg-white border-r border-gray-200 shadow-2xl transition-all duration-300 ease-in-out ${detailId ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}
          style={{ width: '420px' }}
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
