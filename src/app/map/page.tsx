'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import { formatPrice, getDealColor } from '@/lib/utils';
import { MapPin, List, Loader2, SlidersHorizontal } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';

// 카카오맴 타입 (글로벌)
declare global {
  interface Window {
    kakao: any;
  }
}

const dealTypes: DealType[] = ['전세', '월세', '매매'];
const listingTypes: ListingType[] = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];

// 기본 중심: 서울 관악구 신림동
const DEFAULT_CENTER = { lat: 37.4847, lng: 126.9293 };
const DEFAULT_ZOOM = 5; // 카카오맵 레벨 (작을수록 상세)

// 동 클러스터 마커 HTML 생성 (피터팬 스타일)
function createDongClusterContent(dongName: string, count: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition: transform 0.15s ease;
  `;

  // 녹색 원 (카운트)
  const circle = document.createElement('div');
  const size = count >= 100 ? 52 : count >= 10 ? 46 : 40;
  circle.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    font-size: ${count >= 100 ? '14px' : '15px'};
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(34,197,94,0.4), 0 0 0 3px rgba(255,255,255,0.9);
    flex-shrink: 0;
  `;
  circle.textContent = String(count);

  // 동 이름 라벨
  const label = document.createElement('div');
  label.style.cssText = `
    background: rgba(255,255,255,0.95);
    color: #1a1a1a;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 12px;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    border: 1px solid rgba(0,0,0,0.06);
  `;
  label.textContent = dongName;

  wrapper.appendChild(circle);
  wrapper.appendChild(label);

  // 호버 효과
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

// 개별 매물 마커 HTML 생성
function createPriceMarkerContent(listing: Listing): HTMLElement {
  const priceText = listing.deal === '매매'
    ? formatPrice(listing.price || 0)
    : listing.deal === '월세'
    ? `${formatPrice(listing.deposit)}/${listing.monthly}만`
    : formatPrice(listing.deposit);

  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    '전세': { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
    '월세': { bg: '#FFF7ED', border: '#F97316', text: '#C2410C' },
    '매매': { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
  };
  const colors = colorMap[listing.deal] || colorMap['전세'];

  const content = document.createElement('div');
  content.style.cssText = `
    background: ${colors.bg};
    border: 2px solid ${colors.border};
    color: ${colors.text};
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 20px;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    transform: translate(-50%, -100%);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    position: relative;
  `;

  // 거래유형 + 가격
  const dealBadge = document.createElement('span');
  dealBadge.style.cssText = `
    background: ${colors.border};
    color: #fff;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 6px;
    margin-right: 4px;
    font-weight: 600;
  `;
  dealBadge.textContent = listing.deal;

  const priceSpan = document.createElement('span');
  priceSpan.textContent = priceText;

  content.appendChild(dealBadge);
  content.appendChild(priceSpan);

  // 아래 삼각형 (말풕선 꼬리)
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 7px solid ${colors.border};
  `;
  content.appendChild(tail);

  // 호버 효과
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

export default function MapSearchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const dongOverlaysRef = useRef<any[]>([]);

  const { listings, loading, total, fetchListings } = useMapListings();
  const [filters, setFilters] = useState<ListingFilter>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [mapReady, setMapReady] = useState(false);

  // 카카오맵 초기화
  useEffect(() => {
    if (!window.kakao?.maps) {
      console.warn('카카오맵 SDK가 로드되지 않았습니다. .env.local에 NEXT_PUBLIC_KAKAO_MAP_KEY를 설정하세요.');
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

      // bounds 변경 이벤트
      window.kakao.maps.event.addListener(map, 'idle', () => {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        fetchListings({
          swLat: sw.getLat(),
          swLng: sw.getLng(),
          neLat: ne.getLat(),
          neLng: ne.getLng(),
        }, filters);
      });

      // 초기 로드
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      fetchListings({
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      }, filters);
    });
  }, []);

  // 필터 변경 시 재검색
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

  // 마커 업데이트 — 줌 레벨에 따라 동 클러스터 or 개별 마커
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // 기존 마커/오버레이 제거
    markersRef.current.forEach((overlay) => overlay.setMap(null));
    markersRef.current = [];
    dongOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    dongOverlaysRef.current = [];

    const validListings = listings.filter((l) => l.lat && l.lng);
    if (validListings.length === 0) return;

    const level = map.getLevel();

    if (level >= 5) {
      // ── 동 클러스터 모드 (피터팬 스타일) ──
      // 매물을 동 단위로 그룡핑
      const dongGroups: Record<string, { listings: Listing[]; latSum: number; lngSum: number }> = {};

      validListings.forEach((listing) => {
        const dong = listing.dong || '기타';
        if (!dongGroups[dong]) {
          dongGroups[dong] = { listings: [], latSum: 0, lngSum: 0 };
        }
        dongGroups[dong].listings.push(listing);
        dongGroups[dong].latSum += listing.lat!;
        dongGroups[dong].lngSum += listing.lng!;
      });

      // 각 동 그룹에 대해 클러스터 마커 생성
      Object.entries(dongGroups).forEach(([dongName, group]) => {
        const count = group.listings.length;
        const avgLat = group.latSum / count;
        const avgLng = group.lngSum / count;

        const position = new window.kakao.maps.LatLng(avgLat, avgLng);
        const content = createDongClusterContent(dongName, count);

        // 클릭 시 해당 동으로 줌인
        content.addEventListener('click', () => {
          map.setLevel(4, { anchor: position });
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 10,
        });

        overlay.setMap(map);
        dongOverlaysRef.current.push(overlay);
      });

    } else {
      // ── 개별 매물 마커 모드 ──
      validListings.forEach((listing) => {
        const position = new window.kakao.maps.LatLng(listing.lat, listing.lng);
        const content = createPriceMarkerContent(listing);

        // 클릭 이벤트
        content.addEventListener('click', () => {
          setSelectedId(listing.id);
          map.panTo(position);
        });

        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 1.5,
          xAnchor: 0.5,
          zIndex: selectedId === listing.id ? 100 : 1,
        });

        overlay.setMap(map);
        markersRef.current.push(overlay);
      });
    }
  }, [listings, selectedId]);

  // 리스트 카드 호버 시 마커 하이라이트
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

  return (
    <div className="pt-20 h-screen flex flex-col">
      {/* 필터 바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />

        <select
          value={filters.deal || ''}
          onChange={(e) => setFilters({ ...filters, deal: e.target.value as DealType || undefined })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shrink-0"
        >
          <option value="">거래유형</option>
          {dealTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filters.type || ''}
          onChange={(e) => setFilters({ ...filters, type: e.target.value as ListingType || undefined })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shrink-0"
        >
          <option value="">매물유형</option>
          {listingTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* 모바일 뷰 토글 */}
        <div className="md:hidden ml-auto flex bg-gray-100 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setMobileView('map')}
            className={`px-3 py-1 text-xs rounded-md ${mobileView === 'map' ? 'bg-white shadow text-wishes-primary' : 'text-gray-500'}`}
          >
            <MapPin className="w-3 h-3 inline mr-1" />지도
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`px-3 py-1 text-xs rounded-md ${mobileView === 'list' ? 'bg-white shadow text-wishes-primary' : 'text-gray-500'}`}
          >
            <List className="w-3 h-3 inline mr-1" />목록
          </button>
        </div>
      </div>

      {/* 지도 + 리스트 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 카카오맵 영역 */}
        <div className={`relative ${mobileView === 'list' ? 'hidden md:block' : ''} flex-1`}>
          <div ref={mapRef} className="w-full h-full kakao-map-container" />
          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm z-20">
              <Loader2 className="w-4 h-4 animate-spin text-wishes-secondary" />
              매물 검색 중...
            </div>
          )}
          {!loading && mapReady && (
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow text-xs font-medium text-gray-700 z-20">
              현재 지도 영역 <strong className="text-wishes-primary">{total}</strong>건
            </div>
          )}
        </div>

        {/* 매물 리스트 패널 (우측) */}
        <div className={`${mobileView === 'map' ? 'hidden md:block' : ''} w-full md:w-[380px] bg-white border-l border-gray-200 overflow-y-auto custom-scrollbar shrink-0`}>
          <div className="p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">
              매물 <strong className="text-wishes-primary">{total}</strong>건
            </div>
            {listings.length > 0 ? (
              listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  compact
                  onHover={handleCardHover}
                />
              ))
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">
                {loading ? '검색 중...' : '이 영역에 매물이 없습니다'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
