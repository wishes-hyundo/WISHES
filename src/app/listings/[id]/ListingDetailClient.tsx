'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Calendar, ArrowLeft, Check, X, Eye, Hash, ChevronRight, Home, Building2, Thermometer, Compass, DoorOpen, Bath, Banknote, Train, TrendingUp, MapPin, Navigation } from 'lucide-react';
import CompassDirection from '@/components/CompassDirection';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor, formatPrice } from '@/lib/utils';
import ImageGallery from '@/components/ImageGallery';
import { ListingCard } from '@/components/ListingCard';
import RealPriceChart from '@/components/RealPriceChart';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import SmartRecommendations from '@/components/SmartRecommendations';

declare global {
  interface Window {
    kakao: any;
  }
}

interface NearbyStation {
  name: string;
  line: string;
  distance: number;
  walkMin: number;
}

interface Props {
  id: string;
}

// â”€â”€ ìµœê·¼ ë³¸ ë§¤ë¬¼ ê´€ë¦¬ â”€â”€
function addToRecentlyViewed(listingId: number) {
  try {
    const key = 'wishes_recently_viewed';
    const stored = JSON.parse(localStorage.getItem(key) || '[]') as number[];
    const filtered = stored.filter((id) => id !== listingId);
    filtered.unshift(listingId);
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 10)));
  } catch {}
}

function getRecentlyViewed(excludeId: number): number[] {
  try {
    const key = 'wishes_recently_viewed';
    const stored = JSON.parse(localStorage.getItem(key) || '[]') as number[];
    return stored.filter((id) => id !== excludeId).slice(0, 4);
  } catch {
    return [];
  }
}

export default function ListingDetailClient({ id }: Props) {
  const { user, setShowAuthModal } = useAuth();
  const isLoggedIn = !!user;

  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [relatedListings, setRelatedListings] = useState<any[]>([]);
  const [recentListings, setRecentListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ì£¼ë³€ êµí†µ ì •ë³´ ìƒíƒœ
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // ìœ„ì¹˜ ì§€ë„ ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // ì£¼ì†Œ ë§ˆìŠ¤í‚¹: ë¹„ë¡œê·¸ì¸ ì‹œ ë™ê¹Œì§€ë§Œ í‘œì‹œ
  const getMaskedAddress = (address: string) => {
    if (isLoggedIn) return address;
    // "ì„œìš¸ ê´€ì•…êµ¬ ë´‰ì²œë™ 1602-37" â†’ "ì„œìš¸ ê´€ì•…êµ¬ ë´‰ì²œë™"
    const match = address?.match(/^(.*?[ë™ë¦¬ê°€ì‰ë©´])/) ;
    return match ? match[1] : address?.split(' ').slice(0, 3).join(' ') || '';
  };

  useEffect(() => {
    const fetchData = async () => {
      const listingId = parseInt(id);
      const supabase = createClient();

      // ë©”ì¸ ë°ì´í„°ì™€ ë¶€ê°€ ë°ì´í„° ë³‘ë ¬ ë¡œë“œ
      const [listingResult, imagesResult, featuresResult] = await Promise.all([
        supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', listingId),
      ]);

      if (!listingResult.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const data = listingResult.data;
      setListing(data);
      setImages(imagesResult.data || []);
      setFeatures(featuresResult.data || []);
      setLoading(false);

      // ìµœê·¼ ë³¸ ë§¤ë¬¼ì— ì¶”ê°€
      addToRecentlyViewed(listingId);

      // ì¡°íšŒó”˜ ì¦ê°€ (ë¹„ë™ê¸°)
      supabase
        .from('listings')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', listingId)
        .then(() => {})
        .catch(() => {});

      // ì—°ê´€ ë§¤ë¬¼ ë¡œë“œ (ê°™ì€ ë™ + ê°™ì€ ê±°ëž˜ìœ í˜•, ìžê¸° ìžì‹  ì œì™¸)
      const { data: related } = await supabase
        .from('listings')
        .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, listing_images(url, sort_order)')
        .eq('status', 'ê°€ìš©')
        .eq('dong', data.dong)
        .eq('deal', data.deal)
        .neq('id', listingId)
        .order('created_at', { ascending: false })
        .limit(4);

      setRelatedListings(related || []);

      // ìµœê·¼ ë³¸ ë§¤ë¬¼ ë¡œë“œ
      const recentIds = getRecentlyViewed(listingId);
      if (recentIds.length > 0) {
        const { data: recents } = await supabase
          .from('listings')
          .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, listing_images(url, sort_order)')
          .in('id', recentIds)
          .eq('status', 'ê°€ìš©');

        // ì›ëž˜ ìˆœì„œ ìœ ì§€
        const sorted = recentIds
          .map((rid) => (recents || []).find((r: any) => r.id === rid))
          .filter(Boolean);
        setRecentListings(sorted);
      }
    };

    fetchData();
  }, [id]);

  // â”€â”€ ì£¼ë³€ êµí†µ ì •ë³´ ì‹¤ì‹œê°„ ë¡œë“œ â”€â”€
  useEffect(() => {
    if (!listing?.lat || !listing?.lng) return;

    const fetchNearby = async () => {
      setStationsLoading(true);
      try {
        const res = await fetch(`/api/listings/${id}/nearby`);
        const json = await res.json();
        if (json.success && json.data?.stations) {
          setNearbyStations(json.data.stations);
        }
      } catch (err) {
        console.error('Failed to fetch nearby stations:', err);
      } finally {
        setStationsLoading(false);
      }
    };

    fetchNearby();
  }, [listing?.lat, listing?.lng, id]);

  // â”€â”€ ì¹´ì¹´ì˜¤ë§µ ìœ„ì¹˜ í‘œì‹œ ì´ˆê¸°í™” â”€â”€
  useEffect(() => {
    if (!listing?.lat || !listing?.lng || !mapContainerRef.current) return;
    if (typeof window === 'undefined' || !window.kakao?.maps) return;

    const initMap = () => {
      try {
        const kakao = window.kakao;
        const container = mapContainerRef.current;
        if (!container) return;

        // ë¹„ë¡œê·¸ì¸ ì‹œ ë§ˆì»¤ ì²”í‘œë¥¼ ì•½ê°„ íë¦¬ê²Œ (ë°˜ê²½ ~100m ëžœë¤ offset)
        const offsetLat = isLoggedIn ? 0 : (Math.random() - 0.5) * 0.002;
        const offsetLng = isLoggedIn ? 0 : (Math.random() - 0.5) * 0.002;
        const position = new kakao.maps.LatLng(
          listing.lat + offsetLat,
          listing.lng + offsetLng
        );

        const map = new kakao.maps.Map(container, {
          center: position,
          level: 4,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
        });

        // ë§ˆì»¤ (ëŒ€ëžµì  ìœ„ì¹˜ í‘œì‹œ)
        const mapMarker = new kakao.maps.Marker({
          position,
          map,
        });

        // ì¸í¬ìœˆë„ìš° (ë™ ë‹¨ìœ„ê¹Œì§€ë§Œ í‘œì‹œ)
        const displayAddress = isLoggedIn ? (listing.address || 'ë§¤ë¬¼ ìœ„ì¹˜') : (listing.dong || 'ë§¤ë¬¼ ìœ„ì¹˜');
        const infoContent = `<div style="padding:6px 10px;font-size:12px;white-space:nowrap;font-weight:600;">${listing.title || displayAddress}</div>`;
        const infoWindow = new kakao.maps.InfoWindow({
          content: infoContent,
          removable: true,
        });
        infoWindow.open(map, mapMarker);

        mapInstanceRef.current = map;
      } catch (error) {
        console.error('ì¹´ì¹´ì˜¤ë§µ ì´ˆê¸°í™” ì—ëŸ¬:', error);
      }
    };

    // kakao.maps.load ê°€ ì´ë¯¸ ì‹¤í–‰ëì„ ê²½ìš°
    if (window.kakao.maps.LatLng) {
      initMap();
    } else {
      window.kakao.maps.load(initMap);
    }
  }, [listing?.lat, listing?.lng, listing?.title, listing?.address, isLoggedIn, listing?.dong]);

  if (loading) {
    return (
      <div className="pt-16 min-h-screen bg-wishes-bg">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-3">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="aspect-[16/10] bg-gray-200" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
                <div className="h-8 w-2/3 bg-gray-200 rounded mb-2" />
                <div className="h-9 w-1/3 bg-gray-200 rounded mb-6" />
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i}>
                      <div className="h-3 w-12 bg-gray-100 rounded mb-1" />
                      <div className="h-5 w-24 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
                <div className="h-12 w-full bg-gray-200 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="pt-16 min-h-screen bg-wishes-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">ë§¤ë¬¼ì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤</p>
          <Link href="/listings" className="text-wishes-secondary hover:underline mt-2 inline-block">
            ë§¤ë¬¼ ëª©ë¡ìœ¼ë¡œ ëŒì•„ê°€ê¸°
          </Link>
        </div>
      </div>
    );
  }

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  // JSON-LD êµ¬ì¡°í™” ë°ì´í„°
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: listing.description || `${listing.dong} ${listing.type} ${listing.deal}`,
    url: `https://wishes.co.kr/listings/${listing.id}`,
    datePosted: listing.created_at,
    dateModified: listing.updated_at,
    ...(images.length > 0 && { image: images.map((img: any) => img.url) }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: getMaskedAddress(listing.address),
      addressLocality: listing.dong,
      addressRegion: 'ì„œìš¸íŠ¹ë³„ì‹œ',
      addressCountry: 'KR',
    },
    ...(listing.lat && listing.lng && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: listing.lat,
        longitude: listing.lng,
      },
    }),
    floorSize: listing.area_m2 ? {
      '@type': 'QuantitativeValue',
      value: listing.area_m2,
      unitCode: 'MTK',
    } : undefined,
  };

  // BreadcrumbList JSON-LD
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'í™ˆ', item: 'https://wishes.co.kr' },
      { '@type': 'ListItem', position: 2, name: 'ë§¤ë¬¼ ê²€ìƒ‰', item: 'https://wishes.co.kr/listings' },
      { '@type': 'ListItem', position: 3, name: listing.title },
    ],
  };

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* ë¸Œë ˆë“œí¬ëŸ¼ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-1.5 text-sm">
          <Link href="/" className="text-gray-400 hover:text-wishes-secondary transition-colors">
            <Home className="w-4 h-4" />
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/listings" className="text-gray-500 hover:text-wishes-secondary transition-colors">
            ë§¤ë¬¼ ê²€ìƒ‰
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-700 font-medium truncate max-w-[200px] sm:max-w-none">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ì¢Œì¸¡: ì´ë¯¸ì§€ + ìƒì„¸ */}
          <div className="lg:col-span-2 space-y-6">
            <ImageGallery
              images={images}
              title={listing.title}
              deal={listing.deal}
              status={listing.status}
              dealColor={getDealColor(listing.deal)}
              statusColor={getStatusColor(listing.status)}
            />

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                  <Hash className="w-3 h-3" /> W-{listing.id}
                </span>
                {listing.views > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> ì¡°íšŒ {listing.views}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>

              {/* ê¸°ë³¸ ì •ë³´ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
                <InfoRow label="ë§¤ë¬¼ìœ í˜•" value={listing.type} />
                <InfoRow label="ê±°ëž˜ìœ í˜•" value={listing.deal} />
                <InfoRow label="ì „ìš©ë©´ì " value={listing.area_m2 ? `${listing.area_m2}ãŽ¡ (${sqmToPyeong(listing.area_m2)}í‰)` : 'ì •ë³´ ì—†ìŒ'} />
                {listing.area_supply_m2 && (
                  <InfoRow label="ê³µê¸‰ë©´ì " value={`${listing.area_supply_m2}ãŽ¡ (${sqmToPyeong(listing.area_supply_m2)}í‰)`} />
                )}
                <InfoRow label="ì¸µìˆ˜" value={listing.floor_total ? `${listing.floor_current} / ${listing.floor_total}ì¸µ` : listing.floor_current} />
                {listing.rooms && <InfoRow label="ë°© ìˆ˜" value={`${listing.rooms}ê°œ`} />}
                {listing.bathrooms && <InfoRow label="ìš•ì‹¤ ìˆ˜" value={`${listing.bathrooms}ê°œ`} />}
                {listing.direction && <InfoRow label="ë°©í–¥" value={listing.direction} />}
                {listing.heating_type && <InfoRow label="ë‚œë°©ë°©ì‹" value={listing.heating_type} />}
                <div className="col-span-2">
                  <span className="text-xs text-gray-400">ì£¼ì†Œ</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-medium text-gray-800">{getMaskedAddress(listing.address)}</p>
                    {!isLoggedIn && (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-[11px] text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-full transition-colors font-medium"
                      >
                        ë¡œê·¸ì¸í•˜ì—¬ ì „ì²´ ì£¼ì†Œ ë³´ê¸°
                      </button>
                    )}
                  </div>
                </div>
                <InfoRow label="ë™" value={listing.dong} />
                {listing.built_year && <InfoRow label="ì¤€ê³µë…„ë„" value={listing.built_year} />}
                {listing.available_date && <InfoRow label="ìž…ì£¼ê°€ëŠ¥ì¼" value={listing.available_date} />}
              </div>

              {/* V4-10: ë°©í–¥ ë‚˜ì¹¨ë°˜ */}
              {listing.direction && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-wishes-secondary/60" />
                    ë°©í–¥
                  </h3>
                  <CompassDirection direction={listing.direction} />
                </div>
              )}

              {/* ê´€ë¦¬ë¹„ ì •ë³´ (V4-04+09) */}
              {listing.maintenance_fee > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-wishes-secondary/60" />
                    ê´€ë¦¬ë¹„ ì •ë³´
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-lg font-bold text-wishes-primary">
                      ì›” {listing.maintenance_fee.toLocaleString('ko-KR')}ë§Œì›
                    </p>
                    {listing.maintenance_includes?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {listing.maintenance_includes.map((item: string) => (
                          <span key={item} className="px-2 py-0.5 text-xs bg-white text-gray-600 rounded-md border border-gray-200">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ì˜µì…˜ */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">ì˜µì…˜ / ì‹œì„¤</h3>
                <div className="flex flex-wrap gap-2">
                  <OptionBadge label="ì£¼ì°¨" available={listing.parking ?? false} />
                  <OptionBadge label="ì—˜ë¦¬ë² ì´í„°" available={listing.elevator ?? false} />
                  <OptionBadge label="ë°˜ë ¤ë™ë¬¼" available={listing.pet ?? false} />
                  <OptionBadge label="ë°œì½ë‹ˆ" available={listing.balcony ?? false} />
                  <OptionBadge label="í’€ì˜µì…˜" available={listing.full_option ?? false} />
                  {listing.loan_available && (
                    <span className="flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-blue-50 text-blue-700">
                      <Check className="w-3 h-3" /> ëŒ€ì¶œê°€ëŠ¥
                    </span>
                  )}
                  {features.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">
                      {f.feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* ì„¤ëª… */}
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">ìƒì„¸ ì„¤ëª…</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* M1: ì£¼ë³€ êµí†µ ì •ë³´ (ì‹¤ì‹œê°„ ì¹´ì¹´ì˜¤ API) */}
              {listing.lat && listing.lng && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Train className="w-4 h-4 text-blue-500/70" />
                    ì£¼ë³€ êµí†µ
                  </h3>
                  <div className="bg-blue-50/50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">ì´ ë§¤ë¬¼ ì£¼ë³€ ì§€í•˜ì² ì—­ ì •ë³´ (ë°˜ê²½ 2km)</p>
                    {stationsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-center justify-between animate-pulse">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-blue-200" />
                              <div className="h-4 w-20 bg-blue-100 rounded" />
                            </div>
                            <div className="h-3 w-16 bg-blue-100 rounded" />
                          </div>
                        ))}
                      </div>
                    ) : nearbyStations.length > 0 ? (
                      <div className="space-y-2">
                        {nearbyStations.map((station, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">{station.line}</span>
                              <span className="text-sm font-medium text-gray-800">{station.name}ì—­</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{station.distance}m</span>
                              <span className="text-xs font-medium text-blue-600">ë„ë³´ {station.walkMin}ë¶„</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">ë°˜ê²½ 2km ë‚´ ì§€í•˜ì² ì—­ì´ ì—†ìŠµë‹ˆë‹¤.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ìœ„ì¹˜ ì§€ë„ */}
              {listing.lat && listing.lng && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-wishes-primary/70" />
                    ìœ„ì¹˜ ì •ë³´
                  </h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div
                      ref={mapContainerRef}
                      className="w-full h-[280px] sm:h-[320px]"
                      style={{ minHeight: '280px' }}
                    />
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Navigation className="w-3 h-3" />
                        {getMaskedAddress(listing.address)}
                        {!isLoggedIn && (
                          <button
                            onClick={() => setShowAuthModal(true)}
                            className="text-green-600 hover:text-green-700 font-medium ml-1"
                          >
                            ì „ì²´ ì£¼ì†Œ ë³´ê¸°
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* M3: ì‹¤ê±°ëž˜ê°€ ë™í–¥ ì°¨íŠ¸ */}
              {listing.dong && (
                <RealPriceChart
                  listingId={listing.id}
                  dong={listing.dong}
                  type={listing.type || 'ì•„íŒŒíŠ¸'}
                  deal={listing.deal || 'ë§¤ë§¤'}
                />
              )}
            </div>
          </div>

          {/* ìš°ì¸¡: ìƒë‹´ CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">ì´ ë§¤ë¬¼ ë¬¸ì˜í•˜ê¸°</h3>

              {/* ê°€ê²© ìš”ì•½ (U2 ê°€ê²© ë ˆì´ë¸”) */}
              <div className="bg-wishes-accent/5 rounded-xl p-4 mb-4">
                <p className="text-xs text-wishes-muted mb-1">
                  {listing.deal === 'ë§ ë§¤' ? 'ë§¤ë§¤ê°€' : listing.deal === 'ì „ì„¸' ? 'ì „ì„¸ê¸ˆ' : 'ë³´ì¦ê¸ˆ/ì›”ì„¸'}
                </p>
                <p className="text-xl font-bold text-wishes-primary">{price.main}</p>
                {listing.maintenance_fee > 0 && (
                  <p className="text-xs text-wishes-muted mt-1">
                    ê´€ë¦¬ë¹„ {listing.maintenance_fee.toLocaleString('ko-KR')}ë§Œì›/ì›”
                  </p>
                )}
              </div>

              <Link
                href={`/contact?listing=${listing.id}`}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                ì˜¨ë¼ì¸ ìƒë‹´ ì‹ ì²­
              </Link>

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  ë“±ë¡ì¼: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  ìˆ˜ì •ì¼: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
              </div>
            </div>
          </div>
        </div>

            {/* V3-18: 스마트 추천 */}
            <SmartRecommendations listingId={listing.id} dong={listing.dong} />

        {/* ì—°ê´€ ë§¤ë¬¼ (V3-18) */}
        {relatedListings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">
              {listing.dong} ìœ ì‚¬ ë§¤ë¬¼
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedListings.map((item: any) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}

        {/* ìµœê·¼ ë³¸ ë§¤ë¬¼ (V3-27) */}
        {recentListings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">
              ìµœê·¼ ë³¸ ë§¤ë¬¼
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentListings.map((item: any) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function OptionBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <span className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full ${
      available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400 line-through'
    }`}>
      {available ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}
