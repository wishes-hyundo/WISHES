'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import { formatPrice, getDealColor } from '@/lib/utils';
import { MapPin, List, Loader2, SlidersHorizontal } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';

declare global { interface Window { kakao: any; } }

const dealTypes: DealType[] = ['전세', '월세', '매매'];
const listingTypes: ListingType[] = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];
const DEFAULT_CENTER = { lat: 37.4847, lng: 126.9293 };
const DEFAULT_ZOOM = 5;

export default function MapSearchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const { listings, loading, total, fetchListings } = useMapListings();
  const [filters, setFilters] = useState<ListingFilter>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!window.kakao?.maps) { setMapReady(true); return; }
    window.kakao.maps.load(() => {
      if (!mapRef.current) return;
      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: DEFAULT_ZOOM,
      });
      const clusterer = new window.kakao.maps.MarkerClusterer({
        map, averageCenter: true, minLevel: 6, disableClickZoom: false,
        styles: [{ width: '50px', height: '50px', background: 'rgba(26, 54, 93, 0.8)', borderRadius: '50%', color: '#fff', textAlign: 'center', lineHeight: '50px', fontSize: '14px', fontWeight: 'bold' }],
      });
      mapInstanceRef.current = map;
      clustererRef.current = clusterer;
      setMapReady(true);
      window.kakao.maps.event.addListener(map, 'idle', () => {
        const bounds = map.getBounds(); const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast();
        fetchListings({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() }, filters);
      });
      const bounds = map.getBounds(); const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast();
      fetchListings({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() }, filters);
    });
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const bounds = map.getBounds(); const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast();
    fetchListings({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() }, filters);
  }, [filters, fetchListings]);

  useEffect(() => {
    if (!mapInstanceRef.current || !clustererRef.current) return;
    const map = mapInstanceRef.current; const clusterer = clustererRef.current;
    clusterer.clear(); markersRef.current.forEach((m) => m.setMap(null)); markersRef.current = [];
    const newMarkers = listings.filter((l) => l.lat && l.lng).map((listing) => {
      const position = new window.kakao.maps.LatLng(listing.lat, listing.lng);
      const priceText = listing.deal === '매매' ? formatPrice(listing.price || 0) : listing.deal === '월세' ? `${formatPrice(listing.deposit)}/${listing.monthly}만` : formatPrice(listing.deposit);
      const content = document.createElement('div');
      content.className = `map-marker-label deal-${listing.deal}`;
      content.textContent = priceText; content.style.cursor = 'pointer';
      const overlay = new window.kakao.maps.CustomOverlay({ position, content, yAnchor: 1.3 });
      content.addEventListener('click', () => { setSelectedId(listing.id); map.panTo(position); });
      const marker = new window.kakao.maps.Marker({ position });
      marker._overlay = overlay; marker._listing = listing;
      return marker;
    });
    const level = map.getLevel();
    if (level <= 5) { newMarkers.forEach((m) => { m._overlay.setMap(map); }); } else { clusterer.addMarkers(newMarkers); }
    markersRef.current = newMarkers;
  }, [listings]);

  const handleCardHover = useCallback((id: number | null) => {
    setSelectedId(id);
    if (id && mapInstanceRef.current) {
      const marker = markersRef.current.find((m) => m._listing?.id === id);
      if (marker) mapInstanceRef.current.panTo(marker.getPosition());
    }
  }, []);

  return (
    <div className="pt-16 h-screen flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
        <select value={filters.deal || ''} onChange={(e) => setFilters({ ...filters, deal: e.target.value as DealType || undefined })} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shrink-0"><option value="">거래유형</option>{dealTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select value={filters.type || ''} onChange={(e) => setFilters({ ...filters, type: e.target.value as ListingType || undefined })} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shrink-0"><option value="">매물유형</option>{listingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <div className="md:hidden ml-auto flex bg-gray-100 rounded-lg p-0.5 shrink-0">
          <button onClick={() => setMobileView('map')} className={`px-3 py-1 text-xs rounded-md ${mobileView === 'map' ? 'bg-white shadow text-wishes-primary' : 'text-gray-500'}`}><MapPin className="w-3 h-3 inline mr-1" />지도</button>
          <button onClick={() => setMobileView('list')} className={`px-3 py-1 text-xs rounded-md ${mobileView === 'list' ? 'bg-white shadow text-wishes-primary' : 'text-gray-500'}`}><List className="w-3 h-3 inline mr-1" />목록</button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className={`relative ${mobileView === 'list' ? 'hidden md:block' : ''} flex-1 md:w-[70%]`}>
          <div ref={mapRef} className="w-full h-full kakao-map-container" />
          {loading && (<div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin text-wishes-secondary" />매물 검색 중...</div>)}
          {!loading && mapReady && (<div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow text-xs font-medium text-gray-700">현재 지도 영역 <strong className="text-wishes-primary">{total}</strong>건</div>)}
        </div>
        <div className={`${mobileView === 'map' ? 'hidden md:block' : ''} w-full md:w-[30%] bg-white border-l border-gray-200 overflow-y-auto custom-scrollbar`}>
          <div className="p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">매물 <strong className="text-wishes-primary">{total}</strong>건</div>
            {listings.length > 0 ? listings.map((listing) => (<ListingCard key={listing.id} listing={listing} compact onHover={handleCardHover} />)) : (<div className="text-center py-12 text-gray-400 text-sm">{loading ? '검색 중...' : '이 영역에 매물이 없습니다'}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
