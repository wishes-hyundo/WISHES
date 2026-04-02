'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMapListings } from '@/hooks/useMapListings';
import { ListingCard } from '@/components/ListingCard';
import MapListingPanel from '@/components/MapListingPanel';
import { formatPrice } from '@/lib/utils';
import { MapPin, List, Loader2, Search, X, Building2 } from 'lucide-react';
import type { Listing, ListingFilter, DealType, ListingType } from '@/types';

declare global {
  interface Window {
    kakao: any;
  }
}

const dealTypes: DealType[] = ['ì ì¸', 'ìì¸', 'ë§¤ë§¤'];
const listingTypes: ListingType[] = ['ìë£¸', 'í¬ë£·', 'ì°ë¦¬ë£¸', 'ì¤í¼ì¤í', 'ìíí¸', 'ìê°', 'ì¬ë¬´ì¤'];

const DEFAULT_CENTER = { lat: 37.4847, lng: 126.9293 };
const DEFAULT_ZOOM = 5;

// ââââââââââââââââââââââââââââââââââââââââ
// ì£¼ì íì± ì í¸ë¦¬í°
// ââââââââââââââââââââââââââââââââââââââââ
function extractCity(address: string): string {
  if (!address) return 'ê¸°í';
  const parts = address.trim().split(/\s+/);
  if (parts[0]?.includes('ìì¸')) return 'ìì¸';
  if (parts[0]?.includes('ì¸ì²')) return 'ì¸ì²';
  if (parts[0]?.includes('ë¶ì°')) return 'ë¶ì°';
  if (parts[0]?.includes('ëêµ¬')) return 'ëêµ¬';
  if (parts[0]?.includes('ëì ')) return 'ëì ';
  if (parts[0]?.includes('ê´ì£¼')) return 'ê´ì£¼';
  if (parts[0]?.includes('ì¸ì°')) return 'ì¸ì°';
  if (parts[0]?.includes('ì¸ì¢')) return 'ì¸ì¢';
  if (parts[0]?.includes('ê²½ê¸°')) {
    // ê²½ê¸°ë XXì â "XXì"
    if (parts[1]) return parts[1].replace(/ì$/, '') + 'ì';
    return 'ê²½ê¸°';
  }
  return parts[0]?.replace(/(í¸ë³ì|ê´ì­ì|í¹ë³ìì¹ì|í¸ë³ìì¹ë|ë)$/, '') || 'ê¸°í';
}

function extractGu(address: string): string {
  if (!address) return 'ê¸°í';
  const parts = address.trim().split(/\s+/);
  for (const part of parts) {
    if (part.endsWith('êµ¬') || part.endsWith('êµ°')) return part;
  }
  return parts[1] || 'ê¸°í';
}

// ââââââââââââââââââââââââââââââââââââââââ
// ì/ë í´ë¬ì¤í° ë§ì»¤ (Level 9+)
// ââââââââââââââââââââââââââââââââââââââââ
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

// ââââââââââââââââââââââââââââââââââââââââ
// êµ¬ í´ë¬ì¤í° ë§ì»¤ (Level 7-8)
// ââââââââââââââââââââââââââââââââââââââââ
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

// ââââââââââââââââââââââââââââââââââââââââ
// ë í´ë¬ì¤í° ë§ì»¤ (Level 5-6, í¼í°í¬ ì¤íì¼)
// ââââââââââââââââââââââââââââââââââââââââ
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

// ââââââââââââââââââââââââââââââââââââââââ
// ê°ë³ ë§¤ë¬¼ ë§ì»¤ (Level 1-4)
// ââââââââââââââââââââââââââââââââââââââââ
function createPriceMarkerContent(listing: Listing): HTMLElement {
  const priceText = listing.deal === 'ë§¤ë§¤'
    ? formatPrice(listing.price || 0)
    : listing.deal === 'ìì¸'
    ? `${formatPrice(listing.deposit)}/${listing.monthly}ë§`
    : formatPrice(listing.deposit);

  const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    'ì ì¸': { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8', dot: '#3B82F6' },
    'ìì¸': { bg: '#FFF7ED', border: '#F97316', text: '#C2410C', dot: '#F97316' },
    'ë§¤ë§¤': { bg: '#F0FDF4', border: '#22C55E', text: '#15803D', dot: '#22C55E' },
  };
  const colors = colorMap[listing.deal] || colorMap['ì ì¸'];

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

  // ë§íì  ê¼¬ë¦¬
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

// ââââââââââââââââââââââââââââââââââââââââ
// ë©ì¸ ì§ë ì»´í¬ëí¸
// ââââââââââââââââââââââââââââââââââââââââ
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

  // ê²ì íí°ë§ë ë¦¬ì¤í¸
  const filteredListings = useMemo(() => {
    if (!searchQuery.trim()) return listings;
    const q = searchQuery.toLowerCase();
    return listings.filter((l) =>
      l.title?.toLowerCase().includes(q) ||
      l.dong?.toLowerCase().includes(q) ||
      (l.address && l.address.toLowerCase().includes(q)) ||
      l.type?.toLowerCase().includes(q) ||
      l.deal?.toLowerCase().includes(q)
    );
  }, [listings, searchQuery]);

  // ì¤ ë ë²¨ íì¤í¸
  const zoomLevelLabel = useMemo(() => {
    if (zoomLevel >= 9) return 'ì/ë';
    if (zoomLevel >= 7) return 'êµ¬/êµ°';
    if (zoomLevel >= 5) return 'ë/ìë©´';
    return 'ë§¤ë¬¼';
  }, [zoomLevel]);

  // âââ ì¹´ì¹´ì¤ë§µ ì´ê¸°í âââ
  useEffect(() => {
    if (!window.kakao?.maps) {
      console.warn('ì¹´ì¹´ì¤ë§µ SDKê° ë¡ëëì§ ìììµëë¤.');
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

      // ì¤ ë ë²¨ ë³ê²½ ê°ì§
      window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
        setZoomLevel(map.getLevel());
      });

      // idle ì´ë²¤í¸ (ì´ë/ì¤ ìë£ í)
      window.kakao.maps.event.addListener(map, 'idle', fetchBounds);

      // ì´ê¸° ë¡ë
      fetchBounds();
    });
  }, []);

  // âââ íí° ë³ê²½ ì ì¬ê°ì âââ
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

  // âââ ë§ì»¤ ìë°ì´í¸ â ì¤ ë ë²¨ì ë°ë¼ ë¨ê³ë³ ì í âââ
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // ê¸°ì¡´ ì¤ë²ë ì´ ì ë¶ ì ê±°
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const validListings = listings.filter((l) => l.lat && l.lng);
    if (validListings.length === 0) return;

    const level = map.getLevel();

    if (level >= 9) {
      // âââ ì/ë ë ë²¨ í´ë¬ì¤í° âââ
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
      // âââ êµ¬/êµ° ë ë²¨ í´ë¬ì¤í° âââ
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
      // âââ ë ë ë²¨ í´ë¬ì¤í° (í¼í°í¬ ì¤íì¼) âââ
      const dongGroups: Record<string, { listings: Listing[]; latSum: number; lngSum: number }> = {};

      validListings.forEach((listing) => {
        const dong = listing.dong || 'ê¸°í';
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
      // âââ ê°ë³ ë§¤ë¬¼ ë§ì»¤ (ì¤ì¸ ìí) âââ
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

  // âââ ë¦¬ì¤í¸ ì¹´ë í¸ë² âââ
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

  // âââ ë§¤ë«¼ í´ë¦­ â ì¬ë¼ì´ë í¨ë ì´ê¸° âââ
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

  // âââ íí° í ê¸ í¸ë¤ë¬ âââ
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
      {/* âââ ë¤ë°© ì¤íì¼ íí° ë° âââ */}
      <div className="bg-white border-b border-gray-100 shadow-sm shrink-0">
        {/* 1í: ê±°ëì í + ê²ì */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          {/* ê±°ëì í íí° */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilters((prev) => ({ ...prev, deal: undefined }))}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-full border-2 transition-all whitespace-nowrap ${
                !filters.deal
                  ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              ì ì²´
            </button>
            {dealTypes.map((deal) => {
              const dealColors: Record<string, { active: string; ring: string }> = {
                'ì ì¸': { active: 'bg-blue-500 border-blue-500', ring: 'hover:border-blue-300 hover:text-blue-600' },
                'ìì¸': { active: 'bg-orange-500 border-orange-500', ring: 'hover:border-orange-300 hover:text-orange-600' },
                'ë§¤ë§¤': { active: 'bg-emerald-500 border-emerald-500', ring: 'hover:border-emerald-300 hover:text-emerald-600' },
              };
              const c = dealColors[deal] || dealColors['ì ì¸'];
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
            {/* ê²ì ë²í¼ */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-full transition-all ${
                showSearch ? 'bg-wishes-primary text-white' : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* ëª¨ë°ì¼ ë·° í ê¸ */}
            <div className="md:hidden flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMobileView('map')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mobileView === 'map' ? 'bg-white shadow text-wishes-primary font-bold' : 'text-gray-500'
                }`}
              >
                <MapPin className="w-3 h-3 inline mr-1" />ì§ë
              </button>
              <button
                onClick={() => setMobileView('list')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mobileView === 'list' ? 'bg-white shadow text-wishes-primary font-bold' : 'text-gray-500'
                }`}
              >
                <List className="w-3 h-3 inline mr-1" />ëª©ë¡
              </button>
            </div>
          </div>
        </div>

        {/* 2í: ë§¤ë¬¼ì í íí° */}
        <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, type: undefined }))}
            className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all whitespace-nowrap ${
              !filters.type
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            ì ì²´
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

        {/* ê²ì ìë ¥ì°½ (í ê¸) */}
        {showSearch && (
          <div className="px-4 pb-3 animate-fade-in-up">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ì§ì­, ë§¤ë¬¼ëª, í¤ìëë¡ ê²ì..."
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

      {/* âââ ì§ë + ë¦¬ì¤í¸ âââ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ì¹´ì¹´ì¤ë§µ ìì­ */}
        <div className={`relative ${mobileView === 'list' ? 'hidden md:block' : ''} flex-1`}>
          <div ref={mapRef} className="w-full h-full kakao-map-container" />

          {/* ë¡ë© ì¸ëì¼ì´í° */}
          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm z-20">
              <Loader2 className="w-4 h-4 animate-spin text-wishes-secondary" />
              ë§¤ë¬¼ ê²ì ì¤...
            </div>
          )}

          {/* ì¤ ë ë²¨ íì + ë§¤ë¬¼ ì¹´ì´í¸ */}
          {!loading && mapReady && (
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
              <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md text-xs font-medium text-gray-700 flex items-center gap-2">
                <span>íì¬ ì§ë ìì­</span>
                <strong className="text-wishes-primary">{total}</strong>ê±´
              </div>
              <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full shadow text-[10px] font-semibold text-wishes-muted flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  zoomLevel >= 9 ? 'bg-green-700' :
                  zoomLevel >= 7 ? 'bg-blue-500' :
                  zoomLevel >= 5 ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                {zoomLevelLabel} ë¨ì íì
              </div>
            </div>
          )}
        </div>

        {/* âââ ë§¤ë¬¼ ë¦¬ì¤í¸ (ì°ì¸¡ ê³ ì ) âââ */}
        <div className={`${mobileView === 'map' ? 'hidden md:block' : ''} w-full md:w-[380px] bg-white border-l border-gray-200 shrink-0 overflow-y-auto custom-scrollbar`}>
          <div className="p-4 space-y-3">
            {/* ë¦¬ì¤í¸ í¤ë */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">
                ë§¤ë¬¼ <strong className="text-wishes-primary">{searchQuery ? filteredListings.length : total}</strong>ê±´
                {searchQuery && (
                  <span className="ml-1 text-xs text-wishes-muted">
                    &quot;{searchQuery}&quot; ê²ìê²°ê³¼
                  </span>
                )}
              </div>
            </div>

            {/* ë§¤ë¬¼ ì¹´ë ë¦¬ì¤í¸ */}
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
                  {loading ? 'ê²ì ì¤...' : searchQuery ? 'ê²ì ê²°ê³¼ê° ììµëë¤' : 'ì´ ìì­ì ë§¤ë¬¼ì´ ììµëë¤'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-wishes-secondary hover:underline"
                  >
                    ê²ìì´ ì´ê¸°í
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* âââ ë§¤ë¬¼ ìì¸ ì¬ë¼ì´ë í¨ë (ì§ë ì ì¤ë²ë ì´, ëª©ë¡ ì¼ìª½) âââ */}
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
      </div>
    </div>
  );
}
