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
  listing?: any;
}

// ── 최근 본 매물 관리 ──
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

export default function ListingDetailClient({ id, listing: initialListing }: Props) {
  const { user, setShowAuthModal } = useAuth();
  const isLoggedIn = !!user;

  const [listing, setListing] = useState<any>(initialListing || null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [relatedListings, setRelatedListings] = useState<any[]>([]);
  const [recentListings, setRecentListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(!initialListing);
  const [notFound, setNotFound] = useState(false);

  // 주변 교통 정보 상태
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // 위치 지도 ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // 주소 마스킹: 비로그인 시 동까지만 표시
  const getMaskedAddress = (address: string) => {
    if (isLoggedIn) return address;
    const match = address?.match(/^(.*?[동리가읍면])/);
    return match ? match[1] : address?.split(' ').slice(0, 3).join(' ') || '';
  };

  useEffect(() => {
    const fetchData = async () => {
      const listingId = parseInt(id);
      const supabase = createClient();

      // 메인 데이터와 부가 데이터 병렬 로드
      // If listing was passed from server, skip listing fetch (RLS blocks anon client)
      const [listingResult, imagesResult, featuresResult] = await Promise.all([
        initialListing ? Promise.resolve({ data: initialListing }) : supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', listingId),
      ]);

      if (!listingResult.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const data = listingResult.data;
      if (!initialListing) setListing(data);
      setImages(imagesResult.data || []);
      setFeatures(featuresResult.data || []);
      setLoading(false);

      // 최근 본 매물에 추가
      addToRecentlyViewed(listingId);

      // 조회수 증가 (비동기)
      supabase
        .from('listings')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', listingId)
        .then(() => {})
        .catch(() => {});

      // 연관 매물 로드 (같은 동 + 같은 거래유형, 자기 자신 제외)
      const { data: related } = await supabase
        .from('listings')
        .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, listing_images(url, sort_order)')
        .eq('status', '가용')
        .eq('dong', data.dong)
        .eq('deal', data.deal)
        .neq('id', listingId)
        .order('created_at', { ascending: false })
        .limit(4);

      setRelatedListings(related || []);

      // 최근 본 매물 로드
      const recentIds = getRecentlyViewed(listingId);
      if (recentIds.length > 0) {
        const { data: recents } = await supabase
          .from('listings')
          .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, listing_images(url, sort_order)')
          .in('id', recentIds)
          .eq('status', '가용');

        // 원렘 순서 유지
        const sorted = recentIds
          .map((rid) => (recents || []).find((r: any) => r.id === rid))
          .filter(Boolean);
        setRecentListings(sorted);
      }
    };

    fetchData();
  }, [id]);

  // ── 주변 교통 정보 실시간 로드 ──
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

  // ── 카카오맵 위치 표시 초기화 ──
  useEffect(() => {
    if (!listing?.lat || !listing?.lng || !mapContainerRef.current) return;
    if (typeof window === 'undefined' || !window.kakao?.maps) return;

    const initMap = () => {
      const kakao = window.kakao;
      const container = mapContainerRef.current;
      if (!container) return;

      const offsetLat = (Math.random() - 0.5) * 0.003;
        const offsetLng = (Math.random() - 0.5) * 0.003;
        const position = new kakao.maps.LatLng(listing.lat + offsetLat, listing.lng + offsetLng);
      const map = new kakao.maps.Map(container, {
        center: position,
        level: 4,
          draggable: false,
          scrollwheel: false,
          disableDoubleClick: true,
          disableDoubleClickZoom: true,
      });

      // 마커
      // 반경 100m 원으로 대략적 위치 표시 (정확한 주소 비공개)
        new kakao.maps.Circle({
          center: position,
          radius: 100,
          strokeWeight: 2,
          strokeColor: '#4A7C59',
          strokeOpacity: 0.8,
          fillColor: '#4A7C59',
          fillOpacity: 0.15,
          map,
        });

      // 인포윈도우
      const displayAddress = listing.dong || listing.address?.split(' ').slice(0, 3).join(' ') || '매물 위치';
      const infoContent = `<div style="padding:6px 10px;font-size:12px;white-space:nowrap;font-weight:600;">${listing.title || displayAddress || '매물 위치'}</div>`;
      const infoWindow = new kakao.maps.InfoWindow({
        content: infoContent,
        removable: true,
      });
      infoWindow.open(map, marker);

      // 컨튼롤
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

      mapInstanceRef.current = map;
    };

    // kakao.maps.load 가 이미 실행됐을 경우
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
          <p className="text-gray-500 text-lg">매물을 찾을 수 없습니다</p>
          <Link href="/listings" className="text-wishes-secondary hover:underline mt-2 inline-block">
            매물 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  // JSON-LD 구조화 데이터
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
      addressRegion: '서울특별시',
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
      { '@type': 'ListItem', position: 1, name: '홉', item: 'https://wishes.co.kr' },
      { '@type': 'ListItem', position: 2, name: '매물 검색', item: 'https://wishes.co.kr/listings' },
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

      {/* 브레드크럼 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-1.5 text-sm">
          <Link href="/" className="text-gray-400 hover:text-wishes-secondary transition-colors">
            <Home className="w-4 h-4" />
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/listings" className="text-gray-500 hover:text-wishes-secondary transition-colors">
            매물 검색
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-700 font-medium truncate max-w-[200px] sm:max-w-none">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 좌측: 이미지 + 상세 */}
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
                    <Eye className="w-3 h-3" /> 조회 {listing.views}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>

              {/* 기본 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
                <InfoRow label="매물유형" value={listing.type} />
                <InfoRow label="거래유형" value={listing.deal} />
                <InfoRow label="전용면적" value={listing.area_m2 ? `${listing.area_m2}㎡ (${sqmToPyeong(listing.area_m2)}평)` : '정보 없음'} />
                {listing.area_supply_m2 && (
                  <InfoRow label="공급면적" value={`${listing.area_supply_m2}㎡ (${sqmToPyeong(listing.area_supply_m2)}평)`} />
                )}
                <InfoRow label="층수" value={listing.floor_total ? `${listing.floor_current} / ${listing.floor_total}층` : listing.floor_current} />
                {listing.rooms && <InfoRow label="방 수" value={`${listing.rooms}개`} />}
                {listing.bathrooms && <InfoRow label="욕실 수" value={`${listing.bathrooms}개`} />}
                {listing.direction && <InfoRow label="방향" value={listing.direction} />}
                {listing.heating_type && <InfoRow label="난방방식" value={listing.heating_type} />}
                <div className="col-span-2">
                  <span className="text-xs text-gray-400">주소</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-medium text-gray-800">{getMaskedAddress(listing.address)}</p>
                    {!isLoggedIn && (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-[11px] text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-full transition-colors font-medium"
                      >
                        
                      </button>
                    )}
                  </div>
                </div>
                <InfoRow label="동" value={listing.dong} />
                {listing.built_year && <InfoRow label="준공년도" value={listing.built_year} />}
                {listing.available_date && <InfoRow label="입주가능일" value={listing.available_date} />}
              </div>

              {/* V4-10: 방향 나침반 */}
              {listing.direction && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-wishes-secondary/60" />
                    방향
                  </h3>
                  {/* CompassDirection removed */}
                </div>
              )}

              {/* 관리비 정보 (V4-08+09) */}
              {listing.maintenance_fee > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-wishes-secondary/60" />
                    관리비 정보
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-lg font-bold text-wishes-primary">
                      월 {listing.maintenance_fee.toLocaleString('ko-KR')}만원
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

              {/* 옵션 */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h3>
                <div className="flex flex-wrap gap-2">
                  <OptionBadge label="주차" available={listing.parking ?? false} />
                  <OptionBadge label="엘리베이터" available={listing.elevator ?? false} />
                  <OptionBadge label="반려동물" available={listing.pet ?? false} />
                  <OptionBadge label="발코니" available={listing.balcony ?? false} />
                  <OptionBadge label="풀옵션" available={listing.full_option ?? false} />
                  {listing.loan_available && (
                    <span className="flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-blue-50 text-blue-700">
                      <Check className="w-3 h-3" /> 대출가능
                    </span>
                  )}
                  {features.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">
                      {f.feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* 설명 */}
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">상세 설명</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* M1: 주변 교통 정보 (실시간 카카오 API) */}
              {listing.lat && listing.lng && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Train className="w-4 h-4 text-blue-500/70" />
                    주변 교통
                  </h3>
                  <div className="bg-blue-50/50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">이 매물 주변 지하철역 정보 (반경 2km)</p>
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
                              <span className="text-sm font-medium text-gray-800">{station.name}역</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{station.distance}m</span>
                              <span className="text-xs font-medium text-blue-600">도보 {station.walkMin}분</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">반경 2km 내 지하철역이 없습니다.</p>
                    )}
                  </div>
                </div>
              )}

              {/* 위치 지도 */}
              {listing.lat && listing.lng && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-wishes-primary/70" />
                    위치 정보
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
                            
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* M3: 실거래가 동향 차트 */}
              {listing.dong && (
                <RealPriceChart
                  listingId={listing.id}
                  dong={listing.dong}
                  type={listing.type || '아파트'}
                  deal={listing.deal || '매매'}
                />
              )}
            </div>
          </div>

          {/* 우측: 상담 CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>

              {/* 가격 요약 (U2 가격 레이블) */}
              <div className="bg-wishes-accent/5 rounded-xl p-4 mb-4">
                <p className="text-xs text-wishes-muted mb-1">
                  {listing.deal === '매매' ? '매매가' : listing.deal === '전세' ? '전세금' : '보증금/월세'}
                </p>
                <p className="text-xl font-bold text-wishes-primary">{price.main}</p>
                {listing.maintenance_fee > 0 && (
                  <p className="text-xs text-wishes-muted mt-1">
                    관리비 {listing.maintenance_fee.toLocaleString('ko-KR')}만원/월
                  </p>
                )}
              </div>

              <Link
                href={`/contact?listing=${listing.id}`}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                온라인 상담 신청
              </Link>

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 연관 매물 (V3-18) */}
        {listing && <SmartRecommendations listingId={listing.id} dong={listing.dong || ""} />}

          {recentListings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">
              최근 본 매물
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
