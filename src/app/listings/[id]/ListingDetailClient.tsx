'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Calendar, ArrowLeft, Check, X, Eye, Hash, ChevronRight, Home, Building2, Thermometer, Compass, DoorOpen, Bath, Banknote, Train, TrendingUp, MapPin, Navigation, AlertCircle, MessageCircleMore, ShieldCheck, Clock3, BadgeCheck, Info, Printer, Globe } from 'lucide-react';
import CompassDirection from '@/components/CompassDirection';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor, formatPrice } from '@/lib/utils';
import { applyImagePolicy } from '@/lib/image-policy';
import { formatFloorWithTotal } from '@/lib/formatFloor';
import { displayTitle } from '@/lib/formatListingTitle';
import { displayDescription } from '@/lib/formatListingDescription';
// #123: 건물명 표시 방어선 (크롤링 소스·슬로건·URL·지번 차단)
import { sanitizeBuildingName, canShowSameBuildingSection } from '@/lib/sanitizeBuildingName';
import ImageGallery from '@/components/ImageGallery';
import { ListingCard } from '@/components/ListingCard';
import RealPriceChart from '@/components/RealPriceChart';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import SmartRecommendations from '@/components/SmartRecommendations';
// #39: 상세 하단 "이 매물과 비슷한 매물" 추천 섹션 (네모 벤치마크)
import SimilarListings from '@/components/SimilarListings';
// T2-5: VR 투어 뷰어 (vr_url 존재 시 이미지 갤러리 아래에 노출)
import VRTour from '@/components/VRTour';
import ListingEnglishSummary from '@/components/ListingEnglishSummary';
// T5-3: 매물 공유 버튼 (navigator.share + 링크복사 + SMS/이메일)
import ListingActions from '@/components/ListingActions';
// T5-6: 영문 전체 스위치 (외국인 고객 브리핑 품질 향상)
import ListingEnglishFullView from '@/components/ListingEnglishFullView';

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
  // 🔒 2026-04-18: 서버에서 주입한 초기 매물 데이터 (SSR prop).
  //   - page.tsx 가 Supabase 에서 가져와 sanitize 후 전달.
  //   - 클라이언트는 이 데이터를 "그대로" 초기 렌더에 반영하고 재조회를 건너뛴다.
  //   - 누락/에러 시(null) 에만 /api/listings/[id] 공개 게이트로 fallback.
  listing?: any | null;
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

  // 🔒 SSR 주입 데이터에서 이미지/특징을 미리 추출하여 초기 렌더에 즉시 반영
  //   - 크롤링 매물(source_site)은 page.tsx 에서 applyImagePolicy 로 자체 업로드만 남긴 상태
  //   - listing_features 는 [{feature: string}] 모양 → UI 호환용 [{id, feature}] 로 매핑
  const initialImages = Array.isArray(initialListing?.listing_images)
    ? initialListing.listing_images
    : [];
  const initialFeatures = Array.isArray(initialListing?.listing_features)
    ? initialListing.listing_features.map((f: any, i: number) => ({
        id: i,
        feature: typeof f === 'string' ? f : f?.feature,
      }))
    : [];

  const [listing, setListing] = useState<any>(initialListing ?? null);
  const [images, setImages] = useState<any[]>(initialImages);
  const [features, setFeatures] = useState<any[]>(initialFeatures);
  const [relatedListings, setRelatedListings] = useState<any[]>([]);
  const [buildingListings, setBuildingListings] = useState<any[]>([]);
  const [recentListings, setRecentListings] = useState<any[]>([]);
  // SSR 데이터가 있으면 로딩 스켈레톤 없이 즉시 본문 렌더
  const [loading, setLoading] = useState(!initialListing);
  const [notFound, setNotFound] = useState(false);

  // 주변 교통 정보 상태
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // T5-6: 언어 스위치 (ko/en) — localStorage로 지속, URL #en 해시로도 진입 가능
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('wishes_detail_lang');
      const urlWantsEn = window.location.hash === '#en';
      if (urlWantsEn) setLang('en');
      else if (saved === 'en' || saved === 'ko') setLang(saved as 'ko' | 'en');
    } catch {}
  }, []);
  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next: 'ko' | 'en' = prev === 'en' ? 'ko' : 'en';
      try { window.localStorage.setItem('wishes_detail_lang', next); } catch {}
      // 스크롤 위치 리셋하여 상단부터 새 언어 뷰 확인
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return next;
    });
  }, []);

  // 위치 지도 ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // ━━ Quick Nav (섹션 앵커 탭) ━━
  // IntersectionObserver 로 현재 보이는 섹션을 하이라이트
  const [activeSection, setActiveSection] = useState<string>('basic');
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({
    basic: null,
    options: null,
    transit: null,
    price: null,
    description: null,
  });
  const scrollToSection = useCallback((id: string) => {
    const el = sectionsRef.current[id];
    if (!el) return;
    // 헤더(64px) + 퀵네비(48px) 높이 보정
    const y = el.getBoundingClientRect().top + window.pageYOffset - 120;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  // 주소 마스킹: 비로그인 시 동까지만 표시
  const getMaskedAddress = (address: string) => {
    if (isLoggedIn) return address;
    // "서울 관악구 봉천동 1602-37" → "서울 관악구 봉천동"
    const match = address?.match(/^(.+?[동리가읍면])/) ;
    return match ? match[1] : address?.split(' ').slice(0, 3).join(' ') || '';
  };

  useEffect(() => {
    const fetchData = async () => {
      const listingId = parseInt(id);
      const supabase = createClient();

      // 🔒 2026-04-18: SSR 주입 데이터 우선.
      //   - page.tsx 에서 sanitize 를 거친 매물이 prop 으로 내려오면 그대로 사용.
      //   - 없을 때만 공개 게이트(/api/listings/[id]) 로 fallback 하여 재조회.
      let data: any = initialListing ?? null;

      if (!data) {
        try {
          const res = await fetch(`/api/listings/${listingId}`, { cache: 'no-cache' });
          const json = await res.json();
          if (json?.success && json.data) {
            const { images: imgs = [], features: feats = [], ...rest } = json.data;
            data = rest;
            setImages(imgs);
            // 문자열 배열 → {id, feature} 모양으로 변환 (기존 UI 호환)
            setFeatures((feats || []).map((f: string, i: number) => ({ id: i, feature: f })));
          }
        } catch {
          data = null;
        }

        if (!data) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setListing(data);
        setLoading(false);
      }

      // 최근 본 매물에 추가
      addToRecentlyViewed(listingId);

      // 조회수 증가 (비동기)
      supabase
        .from('listings')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', listingId)
        .then(() => {}, () => {}); // PostgrestBuilder는 PromiseLike라 .catch 불가 — then 2-arg로 처리

      // 연관 매물 로드 (같은 동 + 같은 거래유형, 자기 자신 제외)
      // 크롤링 매물(source_site)은 사진 라이선스 이슈로 listing_images 를 비운다
      const { data: related } = await supabase
        .from('listings')
        .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, source_site, listing_images(url, sort_order)')
        .eq('status', '공개')
        .eq('dong', data.dong)
        .eq('deal', data.deal)
        .neq('id', listingId)
        .order('created_at', { ascending: false })
        .limit(4);

      // ※ 저작권 보호 + 자체 업로드 통과 (크롤링 매물이어도 자체 업로드 이미지는 노출)
      const relatedSanitized = (related || []).map((r: any) => applyImagePolicy(r));
      setRelatedListings(relatedSanitized);

      // 같은 건물 다른 매물 (T2-1: 단지/건물 컨텍스트)
      // 크롤링 매물은 building_name 매칭 품질이 낮아 제외(자체 매물 위주)
      if (data.building_name && !data.source_site) {
        const { data: building } = await supabase
          .from('listings')
          .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, source_site, listing_images(url, sort_order)')
          .eq('status', '공개')
          .eq('building_name', data.building_name)
          .neq('id', listingId)
          .order('deal', { ascending: true })
          .order('area_m2', { ascending: true })
          .limit(8);
        // 크롤링 매물은 같은 건물 섹션에서 원천 제외 (이미지 사용 불가)
        setBuildingListings((building || []).filter((b: any) => !b.source_site));
      }

      // 최근 본 매물 로드
      // 크롤링 매물(source_site)은 사진 라이선스 이슈로 listing_images 를 비운다
      const recentIds = getRecentlyViewed(listingId);
      if (recentIds.length > 0) {
        const { data: recents } = await supabase
          .from('listings')
          .select('id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, created_at, source_site, listing_images(url, sort_order)')
          .in('id', recentIds)
          .eq('status', '공개');

        // 원래 순서 유지 + 저작권 정책 적용 (자체 업로드 이미지는 통과)
        const sorted = recentIds
          .map((rid) => (recents || []).find((r: any) => r.id === rid))
          .filter(Boolean)
          .map((r: any) => applyImagePolicy(r));
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
      try {
        const kakao = window.kakao;
        const container = mapContainerRef.current;
        if (!container) return;

        // 비로그인 시 마커 좌푨를 약간 흐리게 (반경 ~100m 랜덤 offset)
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

        // 마커 (대략적 위치 표시)
        const mapMarker = new kakao.maps.Marker({
          position,
          map,
        });

        // 인포윈도우: 로그인 = 제목 우선(제목에 주소가 섞여도 본인 확인 OK), 비로그인 = 항상 동 단위만 (title 우회 차단)
        const displayAddress = isLoggedIn ? (listing.address || '매물 위치') : (listing.dong || '매물 위치');
        const label = isLoggedIn ? (listing.title || displayAddress) : displayAddress;
        const infoContent = `<div style="padding:6px 10px;font-size:12px;white-space:nowrap;font-weight:600;">${label}</div>`;
        const infoWindow = new kakao.maps.InfoWindow({
          content: infoContent,
          removable: true,
        });
        infoWindow.open(map, mapMarker);

        mapInstanceRef.current = map;
      } catch (error) {
        console.error('카카오맵 초기화 에러:', error);
      }
    };

    // kakao.maps.load 가 이미 실행됐을 경우
    if (window.kakao.maps.LatLng) {
      initMap();
    } else {
      window.kakao.maps.load(initMap);
    }
  }, [listing?.lat, listing?.lng, listing?.title, listing?.address, isLoggedIn, listing?.dong]);

  // ━━ 섹션 감지 (스크롤 위치 → 퀵 네비 활성 탭 싱크) ━━
  useEffect(() => {
    if (loading || notFound) return;
    const ids = ['basic', 'options', 'transit', 'price', 'description'];
    const observers: IntersectionObserver[] = [];
    ids.forEach((id) => {
      const el = sectionsRef.current[id];
      if (!el) return;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: '-140px 0px -60% 0px', threshold: 0 }
      );
      io.observe(el);
      observers.push(io);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [loading, notFound, listing?.id]);

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
          <Link href="/map" className="text-wishes-secondary hover:underline mt-2 inline-block">
            지도검색으로 돌아가기
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
    description: listing.ai_description || `${listing.dong} ${listing.type} ${listing.deal}`,
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
      { '@type': 'ListItem', position: 1, name: '홈', item: 'https://wishes.co.kr' },
      { '@type': 'ListItem', position: 2, name: '매물 검색', item: 'https://wishes.co.kr/listings' },
      { '@type': 'ListItem', position: 3, name: listing.title },
    ],
  };

  return (
    <div className="pt-16 pb-20 lg:pb-0 min-h-screen bg-wishes-bg">
      {/* JSON-LD */}
      {/* L-xss2 (2026-04-22): JSON-LD 안에 listing.title/description 등
          관리자 입력 이 들어가니 "</script>" 난입으로의 XSS 분기 존재.
          JSON.stringify 출력의 '<' 를 \\u003c 로 치환해 <script> 컨텍스트에서 안전. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />

      {/* 브레드크럼 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-1.5 text-sm">
          <Link href="/" aria-label="홈으로" className="text-gray-500 hover:text-wishes-secondary transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/map" className="text-gray-500 hover:text-wishes-secondary transition-colors">
            지도검색
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-700 font-medium truncate max-w-[200px] sm:max-w-none">{displayTitle(listing)}</span>
        </div>
      </div>

      {/* ━━ 퀵 네비게이션 (스티키 탭) ━━ EN 모드에서는 숨김 */}
      <div className={`sticky top-16 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 ${lang === 'en' ? 'hidden' : ''}`}>
        <div className="max-w-5xl mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1 py-2">
            {[
              { id: 'basic', label: '기본정보' },
              { id: 'options', label: '시설/옵션' },
              { id: 'transit', label: '주변교통' },
              { id: 'price', label: '시세' },
              { id: 'description', label: '매물설명' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => scrollToSection(tab.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeSection === tab.id
                    ? 'bg-wishes-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* T5-2: 인쇄 전용 머리글 — 화면에서는 숨김 */}
        <div className="print-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '18pt', fontWeight: 700, color: '#1e5a32' }}>WISHES 부동산 · 매물 브리핑</div>
              <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>
                매물번호 {listing.id} · 출력일 {new Date().toLocaleDateString('ko-KR')}
              </div>
            </div>
            <div style={{ fontSize: '10pt', color: '#777' }}>wishes.co.kr</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 좌측: 이미지 + 상세 */}
          <div className="lg:col-span-2 space-y-6">
            {/* images 는 applyImagePolicy 로 자체 업로드만 남은 배열 — 그대로 전달 */}
            <ImageGallery
              images={images}
              title={displayTitle(listing)}
              deal={listing.deal}
              status={listing.status}
              dealColor={getDealColor(listing.deal)}
              statusColor={getStatusColor(listing.status)}
              isAdListing={!!listing?.source_site}
            />

            {/* T2-5: VR 투어 (자체 매물만, vr_url 등록 시 표시) */}
            <VRTour vrUrl={listing?.vr_url} isAd={!!listing?.source_site} />

            {/* T5-6: 영문 전체 모드 — 한국어 상세 본문을 대체 */}
            {lang === 'en' && (
              <ListingEnglishFullView
                listing={listing}
                stations={nearbyStations}
                onExit={toggleLang}
              />
            )}

            {/* T3-4: 영문 요약 블록 (외국인 임차 수요 타겟, 자체 매물만) */}
            {lang === 'ko' && <ListingEnglishSummary listing={listing} />}

            <div className={`bg-white rounded-xl border border-gray-200 p-6 ${lang === 'en' ? 'hidden' : ''}`}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                  매물번호 {listing.id}
                </span>
                {listing.views > 0 && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> 조회 {listing.views}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-wishes-primary">{displayTitle(listing)}</h1>


              {/* 기본 정보 */}
              <div
                id="section-basic"
                ref={(el) => { sectionsRef.current.basic = el; }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6 scroll-mt-32"
              >
                <InfoRow label="매물유형" value={listing.type} />
                <InfoRow label="거래유형" value={listing.deal} />
                <InfoRow label="전용면적" value={listing.area_m2 ? `${listing.area_m2}㎡ (${sqmToPyeong(listing.area_m2)}평)` : '정보 없음'} />
                {listing.area_supply_m2 && (
                  <InfoRow label="공급면적" value={`${listing.area_supply_m2}㎡ (${sqmToPyeong(listing.area_supply_m2)}평)`} />
                )}
                <InfoRow label="층수" value={formatFloorWithTotal(listing.floor_current, listing.floor_total)} />
                {!['상가', '사무실'].includes(listing.type) && listing.rooms && <InfoRow label="방 수" value={`${listing.rooms}개`} />}
                {!['상가', '사무실'].includes(listing.type) && listing.bathrooms && <InfoRow label="욕실 수" value={`${listing.bathrooms}개`} />}
                {listing.direction && <InfoRow label="방향" value={listing.direction} />}
                {listing.heating_type && <InfoRow label="난방방식" value={listing.heating_type} />}
                <div className="col-span-2">
                  <span className="text-xs text-gray-500">주소</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-medium text-gray-800">{getMaskedAddress(listing.address)}</p>
                    {!isLoggedIn && (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-[11px] text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-full transition-colors font-medium"
                      >
                        로그인하여 전체 주소 보기
                      </button>
                    )}
                  </div>
                </div>
                <InfoRow label="동" value={listing.dong} />
                {listing.built_year && <InfoRow label="준공년도" value={listing.built_year} />}
                {listing.available_date && <InfoRow label="입주가능일" value={listing.available_date} />}
                {listing.gu && <InfoRow label="구" value={listing.gu} />}
                {sanitizeBuildingName(listing.building_name) && (
                  <InfoRow label="건물명" value={sanitizeBuildingName(listing.building_name)!} />
                )}
                {listing.entrance_type && <InfoRow label="현관구조" value={listing.entrance_type} />}
                {listing.lease_period && <InfoRow label="임대기간" value={listing.lease_period} />}
                {listing.building_purpose && <InfoRow label="건물용도" value={listing.building_purpose} />}
                {listing.usage_approved && <InfoRow label="사용승인일" value={listing.usage_approved} />}
              </div>

              {/* V4-10: 방향 나침반 */}
              {listing.direction && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-wishes-secondary/60" />
                    방향
                  </h2>
                  <CompassDirection direction={listing.direction} />
                </div>
              )}

              {/* 관리비 정보 (V4-08+09) */}
              {listing.maintenance_fee > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-wishes-secondary/60" />
                    관리비 정보
                  </h2>
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

              {/* 상업/비용 정보 */}
              {(listing.rights_fee || listing.goodwill_fee || listing.commission_fee || listing.parking_fee || listing.business_type || listing.previous_brand || listing.previous_business || listing.recommended_business || listing.restricted_business) && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-wishes-secondary/60" />
                    상업 · 비용 정보
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listing.business_type && <InfoRow label="업종" value={listing.business_type} />}
                    {listing.previous_brand && <InfoRow label="이전상호" value={listing.previous_brand} />}
                    {listing.previous_business && <InfoRow label="이전업종" value={listing.previous_business} />}
                    {listing.recommended_business && <InfoRow label="권장업종" value={listing.recommended_business} />}
                    {listing.restricted_business && <InfoRow label="제한업종" value={listing.restricted_business} />}
                    {listing.rights_fee > 0 && <InfoRow label="권리금" value={`${listing.rights_fee.toLocaleString('ko-KR')}만원`} />}
                    {listing.goodwill_fee > 0 && <InfoRow label="시설권리금" value={`${listing.goodwill_fee.toLocaleString('ko-KR')}만원`} />}
                    {listing.commission_fee > 0 && <InfoRow label="중개수수료" value={`${listing.commission_fee.toLocaleString('ko-KR')}만원`} />}
                    {listing.parking_fee > 0 && <InfoRow label="주차비" value={`${listing.parking_fee.toLocaleString('ko-KR')}만원/월`} />}
                    {listing.vat_included !== null && listing.vat_included !== undefined && <InfoRow label="부가세" value={listing.vat_included ? '포함' : '별도'} />}
                  </div>
                </div>
              )}

              {/* 시설 정보 */}
              {(listing.parking_spaces || listing.electric_capacity || listing.signage_available !== null || listing.meeting_room) && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Home className="w-4 h-4 text-wishes-secondary/60" />
                    시설 정보
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listing.parking_spaces > 0 && <InfoRow label="주차대수" value={`${listing.parking_spaces}대`} />}
                    {listing.electric_capacity && <InfoRow label="전기용량" value={listing.electric_capacity} />}
                    {listing.signage_available !== null && listing.signage_available !== undefined && <InfoRow label="간판설치" value={listing.signage_available ? '가능' : '불가'} />}
                    {listing.meeting_room > 0 && <InfoRow label="회의실" value={`${listing.meeting_room}개`} />}
                  </div>
                </div>
              )}

              {/* 옵션 */}
              <div
                id="section-options"
                ref={(el) => { sectionsRef.current.options = el; }}
                className="mt-6 pt-6 border-t border-gray-100 scroll-mt-32"
              >
                <h2 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h2>
                <div className="flex flex-wrap gap-2">
                  <OptionBadge label="주차" available={listing.parking ?? false} />
                  <OptionBadge label="엘리베이터" available={listing.elevator ?? false} />
                  {!['상가', '사무실'].includes(listing.type) && (
                    <>
                      <OptionBadge label="반려동물" available={listing.pet ?? false} />
                      <OptionBadge label="발코니" available={listing.balcony ?? false} />
                      <OptionBadge label="풀옵션" available={listing.full_option ?? false} />
                    </>
                  )}
                  {listing.loan_available && (
                    <span className="flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-blue-50 text-blue-700">
                      <Check className="w-3 h-3" /> 대출가능
                    </span>
                  )}
                   {(() => {
                     const allFeatures = new Set<string>();
                     features.forEach(f => allFeatures.add(f.feature));
                     if (listing.features && Array.isArray(listing.features)) {
                       listing.features.forEach((f: string) => allFeatures.add(f));
                     }
                     return Array.from(allFeatures).map((f, idx) => (
                       <span key={`feat-${idx}`} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">
                         {f}
                       </span>
                     ));
                   })()}
                </div>
              </div>

              {/* 매물설명 (AI 생성 - 고객 노출용) + SEO 태그/키워드 병기 (검색 노출 최적화) */}
              {(() => {
                const seoTagChips: string[] = Array.from(new Set(
                  (Array.isArray((listing as any).seo_tags) ? (listing as any).seo_tags : [])
                    .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
                    .filter((t: string) => t.length > 0)
                )).slice(0, 12) as string[];
                const seoKeywordLine: string = (Array.from(new Set(
                  (Array.isArray((listing as any).seo_keywords) ? (listing as any).seo_keywords : [])
                    .map((k: any) => (typeof k === 'string' ? k.trim() : ''))
                    .filter((k: string) => k.length > 0)
                )) as string[]).slice(0, 20).join(', ');
                // ai_description 또는 raw description 이 있으면 그대로,
                // 없으면 rich 데이터 기반 자동 생성으로 폴백 — "매물설명 없음" 방지
                const descText = displayDescription(listing);
                const hasDesc = !!descText;
                const hasSeo = seoTagChips.length > 0 || seoKeywordLine.length > 0;
                if (!hasDesc && !hasSeo) return null;
                return (
                  <div
                    id="section-description"
                    ref={(el) => { sectionsRef.current.description = el; }}
                    className="mt-6 pt-6 border-t border-gray-100 scroll-mt-32"
                  >
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">매물설명</h2>
                    {hasDesc && (
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                        {descText}
                      </p>
                    )}
                    {seoTagChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {seoTagChips.map((t, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center text-[11px] font-medium text-wishes-primary bg-wishes-primary/5 border border-wishes-primary/15 px-2 py-0.5 rounded-full"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    {seoKeywordLine && (
                      <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                        {seoKeywordLine}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 특이사항 */}
              {listing.special_notes && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">특이사항</h2>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.special_notes}
                  </p>
                </div>
              )}

              {/* 크롤링된 역 정보 (lat/lng 없을 때 대체) */}
              {listing.station_name && !listing.lat && (
                <div
                  id="section-transit"
                  ref={(el) => { sectionsRef.current.transit = el; }}
                  className="mt-6 pt-6 border-t border-gray-100 scroll-mt-32"
                >
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Train className="w-4 h-4 text-blue-500/70" />
                    주변 교통
                  </h2>
                  <div className="bg-blue-50/50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{listing.station_name}</span>
                      {listing.station_distance && (
                        <span className="text-xs text-gray-500">{listing.station_distance}m</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* M1: 주변 교통 정보 (실시간 카카오 API) */}
              {listing.lat && listing.lng && (
                <div
                  id="section-transit"
                  ref={(el) => { sectionsRef.current.transit = el; }}
                  className="mt-6 pt-6 border-t border-gray-100 scroll-mt-32"
                >
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Train className="w-4 h-4 text-blue-500/70" />
                    주변 교통
                  </h2>
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
                              <span className="text-xs text-gray-500">{station.distance}m</span>
                              <span className="text-xs font-medium text-blue-600">도보 {station.walkMin}분</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">반경 2km 내 지하철역이 없습니다.</p>
                    )}
                  </div>
                </div>
              )}

              {/* 위치 지도 */}
              {listing.lat && listing.lng && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-wishes-primary/70" />
                    위치 정보
                  </h2>
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
                            전체 주소 보기
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* M3: 실거래가 동향 차트 */}
              {listing.dong && (
                <div
                  id="section-price"
                  ref={(el) => { sectionsRef.current.price = el; }}
                  className="scroll-mt-32"
                >
                <RealPriceChart
                  listingId={listing.id}
                  dong={listing.dong}
                  type={listing.type || '아파트'}
                  deal={listing.deal || '매매'}
                />
                </div>
              )}
            </div>
          </div>

          {/* 우측: 상담 CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-32">
              {/* ━━ WISHES 신뢰 배지 ━━ */}
              {listing?.source_site ? (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200/70 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-amber-800">
                    <p className="font-semibold">외부 광고 매물</p>
                    <p className="mt-0.5 text-amber-700">WISHES 에서 직접 확인하여 안내드립니다. 정확한 조건·잔여 여부는 상담을 통해 확인하세요.</p>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-wishes-primary/5 to-wishes-secondary/5 border border-wishes-primary/15">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-wishes-primary" />
                    <span className="text-[11px] font-bold text-wishes-primary">WISHES 전담 중개사</span>
                    <BadgeCheck className="w-3.5 h-3.5 text-wishes-secondary" />
                  </div>
                  <div className="flex items-center gap-2.5 text-[10.5px] text-wishes-muted">
                    <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />평균 2시간 내 응답</span>
                    <span className="text-gray-300">·</span>
                    <span>직접 검증한 매물</span>
                  </div>
                </div>
              )}

              <h2 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h2>

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
                {lang === 'en' ? 'Request Consultation' : '온라인 상담 신청'}
              </Link>

              {/* T5-6: 한/영 언어 전환 — 외국인 고객 브리핑 */}
              <button
                type="button"
                onClick={toggleLang}
                className={`mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-sm transition-colors no-print ${
                  lang === 'en'
                    ? 'bg-wishes-primary text-white hover:bg-wishes-secondary'
                    : 'bg-white border border-wishes-primary/30 text-wishes-primary hover:bg-wishes-primary/5'
                }`}
                title={lang === 'en' ? '한국어로 보기' : 'English briefing for international clients'}
              >
                <Globe className="w-4 h-4" aria-hidden="true" />
                {lang === 'en' ? '한국어 (KR)' : 'English (EN) 영문으로 보기'}
              </button>

              {/* T5-2: 인쇄/PDF 저장 — 중개사가 고객 브리핑용으로 활용 */}
              <button
                type="button"
                onClick={() => typeof window !== 'undefined' && window.print()}
                className="mt-2 flex items-center justify-center gap-2 w-full bg-white border border-wishes-primary/30 text-wishes-primary py-2.5 rounded-xl font-semibold text-sm hover:bg-wishes-primary/5 transition-colors no-print"
                title="매물 브리핑 자료 인쇄 또는 PDF 저장"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                {lang === 'en' ? 'Print / Save as PDF' : '브리핑 자료 인쇄 / PDF 저장'}
              </button>

              {/* T5-3: 매물 공유 (링크 + OG 썸네일 자동 생성) */}
              <div className="mt-2">
                <ListingActions
                  listingId={String(listing.id)}
                  shareUrl={`https://wishes.co.kr/listings/${listing.id}`}
                  shareTitle={`${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''}`.trim() + ' | WISHES'}
                  shareDescription={listing.title || `${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''}`.trim()}
                />
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
                {listing.contact && (
                  <p className="text-xs text-gray-500 mt-2">연락처: {listing.contact}</p>
                )}
                {listing.source_url && (
                  <a href={listing.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-1 block">
                    원본 매물 보기 →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* V3-18: 스마트 추천 */}
        <SmartRecommendations listingId={listing.id} dong={listing.dong} />

        {/* #39: 이 매물과 비슷한 매물 (동일 유형·지역·가격대 스코어링) */}
        <div className="mt-12">
          <SimilarListings listingId={listing.id} dong={listing.dong} limit={4} />
        </div>

        {/* T2-1: 같은 건물 다른 매물 (단지/건물 컨텍스트) */}
        {/* #123 : 건물명 방어선 통과 시에만 노출. 오염된 건물명은 섹션 자체 숨김 */}
        {canShowSameBuildingSection(listing.building_name, buildingListings.length) && (() => {
          const safeName = sanitizeBuildingName(listing.building_name)!;
          return (
            <div className="mt-12">
              <div className="flex items-center gap-2 mb-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wishes-primary/10 text-wishes-primary text-xs font-bold">
                  <Building2 className="w-3.5 h-3.5" /> 같은 건물
                </div>
                <h2 className="text-lg font-bold text-wishes-primary">
                  {safeName}
                  <span className="text-xs font-normal text-wishes-muted ml-2">
                    현재 {buildingListings.length}건 등록
                  </span>
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {buildingListings.slice(0, 4).map((item: any) => (
                  <ListingCard key={item.id} listing={item} />
                ))}
              </div>
              {buildingListings.length > 4 && (
                <div className="mt-3 text-right">
                  <Link
                    href={`/listings?search=${encodeURIComponent(safeName)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-wishes-primary hover:underline"
                  >
                    이 건물 전체 매물 보기 ({buildingListings.length}건) <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          );
        })()}

        {/* 연관 매물 (V3-18) */}
        {relatedListings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">
              {listing.dong} 유사 매물
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedListings.map((item: any) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}

        {/* 최근 본 매물 (V3-27) */}
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

      {/* 모바일 하단 Sticky CTA - lg 미만에서만 노출 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 py-3 safe-area-inset-bottom">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-wishes-muted leading-none mb-1">
              {listing.deal === '매매' ? '매매가' : listing.deal === '전세' ? '전세금' : '보증금/월세'}
            </p>
            <p className="text-base font-bold text-wishes-primary truncate">{price.main}</p>
          </div>
          <Link
            href={`/contact?listing=${listing.id}`}
            className="shrink-0 flex items-center gap-1.5 bg-wishes-primary text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-wishes-secondary transition-colors shadow-md"
          >
            <MessageCircleMore className="w-4 h-4" />
            온라인 상담
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-500">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function OptionBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <span className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full ${
      available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500 line-through'
    }`}>
      {available ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}
