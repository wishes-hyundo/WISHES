'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  Calendar, ArrowLeft, Check, X, Eye, Hash, ChevronRight,
  Home, Building2, Thermometer, Compass, DoorOpen, Banknote,
  Train, TrendingUp, MapPin, Navigation, Share2, Copy
} from 'lucide-react';
import CompassDirection from '@/components/CompassDirection';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor, formatPrice } from '@/lib/utils';
import ImageGallery from '@/components/ImageGallery';
import { ListingCard } from '@/components/ListingCard';

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

// ── 최근 본 매물 관리 ──
function addToRecentlyViewed(listing: any) {
  try {
    const key = 'recently_viewed_listings';
    const stored = localStorage.getItem(key);
    let arr: any[] = stored ? JSON.parse(stored) : [];
    arr = arr.filter((item: any) => item.id !== listing.id);
    arr.unshift({
      id: listing.id,
      title: listing.title,
      deal: listing.deal,
      price: listing.price,
      deposit: listing.deposit,
      monthly: listing.monthly,
      dong: listing.dong,
      type: listing.type,
      area_m2: listing.area_m2,
      image: listing.listing_images?.[0]?.url || null,
      viewedAt: new Date().toISOString(),
    });
    if (arr.length > 20) arr = arr.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

export default function ListingDetailClient({ id }: Props) {
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nearbyListings, setNearbyListings] = useState<any[]>([]);

  // 주변 교통 정보
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // 카카오 지도 ref
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const lid = parseInt(id);
      const supabase = createClient();

      // 메인 데이터와 부가 데이터 불러오기
      const [lr, ir, fr] = await Promise.all([
        supabase.from('listings').select('*').eq('id', lid).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', lid).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', lid),
      ]);

      if (!lr.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // 최근 본 매물에 추가 (비동기)
      addToRecentlyViewed(lr.data);

      setListing(lr.data);
      setImages(ir.data || []);
      setFeatures(fr.data || []);
      setLoading(false);

      // 조회수 증가
      supabase.from('listings').update({ views: (lr.data.views || 0) + 1 }).eq('id', lid).then(() => {}).catch(() => {});

      // 연관 매물 로드 (같은 동 + 같은 타입)
      if (lr.data.dong) {
        const q = supabase
          .from('listings')
          .select('*, listing_images(url, sort_order)')
          .eq('status', '가용')
          .neq('id', lid)
          .limit(4);

        if (lr.data.dong) q.eq('dong', lr.data.dong);

        const { data: related } = await q;
        if (related) {
          // 최근 본 매물 로드
          const nearby = related.map((r: any) => ({
            ...r,
            images: r.listing_images?.sort((a: any, b: any) => a.sort_order - b.sort_order) || [],
          }));
          setNearbyListings(nearby.slice(0, 4));
        }
      }
    };
    fetchData();
  }, [id]);

  // 주변 교통 API 호출
  useEffect(() => {
    if (!listing?.id) return;
    setStationsLoading(true);
    fetch(`/api/listings/${listing.id}/nearby`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data?.stations) {
          setNearbyStations(json.data.stations);
        }
      })
      .catch(() => {})
      .finally(() => setStationsLoading(false));
  }, [listing?.id]);

  // 카카오 지도 초기화
  useEffect(() => {
    if (!listing?.lat || !listing?.lng || !mapRef.current) return;
    const initMap = () => {
      if (!window.kakao?.maps) return;
      window.kakao.maps.load(() => {
        const container = mapRef.current;
        if (!container) return;
        const options = {
          center: new window.kakao.maps.LatLng(listing.lat, listing.lng),
          level: 4,
        };
        const map = new window.kakao.maps.Map(container, options);
        new window.kakao.maps.Marker({
          map,
          position: new window.kakao.maps.LatLng(listing.lat, listing.lng),
        });
      });
    };
    if (window.kakao?.maps) {
      initMap();
    } else {
      const checkInterval = setInterval(() => {
        if (window.kakao?.maps) {
          clearInterval(checkInterval);
          initMap();
        }
      }, 500);
      return () => clearInterval(checkInterval);
    }
  }, [listing?.lat, listing?.lng]);

  if (loading) return (
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
              <div className="h-8 w-2/3 bg-gray-200 rounded mb-2" />
              <div className="h-9 w-1/3 bg-gray-200 rounded mb-6" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({length:6}).map((_,i)=>(
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

  if (notFound) return (
    <div className="pt-16 min-h-screen bg-wishes-bg flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 text-lg">매물을 찾을 수 없습니다</p>
        <Link href="/listings" className="text-wishes-secondary hover:underline mt-2 inline-block">매물 목록으로</Link>
      </div>
    </div>
  );

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleKakaoShare = () => {
    if (typeof window !== 'undefined' && window.Kakao) {
      if (!window.Kakao.isInitialized()) return;
      const img = listing?.listing_images?.[0]?.url || listing?.images?.[0]?.url || '';
      const priceText = listing?.deal === '매매'
        ? (listing.price >= 10000 ? Math.floor(listing.price/10000)+'억' : listing.price?.toLocaleString()+'만원')
        : listing?.deposit?.toLocaleString()+'/'+listing?.monthly?.toLocaleString();
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: listing?.title || '매물 정보',
          description: (listing?.dong||'')+' '+(listing?.type||'')+' '+(listing?.deal||'')+' '+priceText,
          imageUrl: img,
          link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
        },
        buttons: [{ title: '매물 보기', link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }],
      });
    }
  };

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* ── 상단 네비게이션 ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary">
            <ArrowLeft className="w-4 h-4" />매물 목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium truncate">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── 왼쪽 메인 영역 ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* 이미지 갤러리 */}
            <ImageGallery
              images={images}
              title={listing.title}
              deal={listing.deal}
              status={listing.status}
              dealColor={getDealColor(listing.deal)}
              statusColor={getStatusColor(listing.status)}
            />

            {/* ── 매물 기본 정보 ── */}
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

              {/* 상세 정보 그리드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
                <IR label="매물유형" value={listing.type} />
                <IR label="거래유형" value={listing.deal} />
                <IR label="전용면적" value={listing.area_m2 ? listing.area_m2 + '㎡ (' + sqmToPyeong(listing.area_m2) + '평)' : '정보 없음'} />
                <IR label="층수" value={listing.floor_current} />
                <IR label="주소 (동)" value={listing.dong ? listing.dong + (listing.address_detail ? ' ' + listing.address_detail : '') : listing.address} fw />
                {listing.address && (
                  <details className="col-span-2">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">도로명 주소 보기</summary>
                    <p className="text-sm text-gray-700 mt-1 pl-1">{listing.address}{listing.address_detail ? ' ' + listing.address_detail : ''}</p>
                  </details>
                )}
                {listing.built_year && <IR label="준공년도" value={listing.built_year} />}
                {listing.available_date && <IR label="입주가능일" value={listing.available_date} />}
              </div>

              {/* 옵션 / 시설 */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h3>
                <div className="flex flex-wrap gap-2">
                  <OB label="주차" a={listing.parking ?? false} />
                  <OB label="엘리베이터" a={listing.elevator ?? false} />
                  <OB label="반려동물" a={listing.pet ?? false} />
                  <OB label="발코니" a={listing.balcony ?? false} />
                  <OB label="풀옵션" a={listing.full_option ?? false} />
                  {features.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">{f.feature}</span>
                  ))}
                </div>
              </div>

              {/* 상세 설명 */}
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">상세 설명</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
                </div>
              )}
            </div>

            {/* ── 주변 교통 섹션 ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Train className="w-5 h-5 text-blue-500" /> 주변 교통
              </h3>
              <div className="bg-blue-50/50 rounded-xl p-3.5">
                {stationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex items-center justify-between animate-pulse">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-blue-200" />
                          <div className="h-3.5 w-16 bg-blue-100 rounded" />
                        </div>
                        <div className="h-3 w-14 bg-blue-100 rounded" />
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
                        <span className="text-xs text-blue-600 font-medium">도보 {station.walkMin}분</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">반경 2km 내 지하철역 없음</p>
                )}
              </div>
            </div>

            {/* ── 실거래가 동향 섹션 ── */}
            {listing.dong && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" /> {listing.dong} 실거래가 동향
                </h3>
                <div className="bg-green-50/50 rounded-xl p-3.5">
                  <a
                    href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-100 hover:bg-green-200 px-3 py-2 rounded-lg transition-colors font-medium"
                  >
                    <TrendingUp className="w-3 h-3" />
                    국토교통부 실거래가 조회
                    <ChevronRight className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-gray-400 mt-2">상단 시 최신 실거래가를 안내드립니다.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── 오른쪽 사이드바 ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>
              <Link
                href={'/contact?listing_id=' + listing.id + '&listing_title=' + encodeURIComponent(listing.title)}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                온라인 상담 신청
              </Link>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 공유 & 지도 & 연관매물 영역 ── */}
      <div className="max-w-5xl mx-auto px-4 pb-8 space-y-6">
        {/* 공유하기 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-green-600" /> 공유하기
          </h3>
          <div className="flex gap-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? '복사 완료!' : '링크 복사'}
            </button>
            <button
              onClick={handleKakaoShare}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#FEE500] hover:bg-[#F5DC00] transition-colors text-sm font-medium text-[#3C1E1E]"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#3C1E1E">
                <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.86 5.21 4.65 6.6-.15.56-.96 3.6-.99 3.83 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.7-2.44 4.28-2.86.55.08 1.13.13 1.73.13 5.52 0 10-3.58 10-7.95C22 6.58 17.52 3 12 3"/>
              </svg>
              카카오톡 공유
            </button>
          </div>
        </div>

        {/* 위치 정보 (카카오 SDK 지도) */}
        {listing?.lat && listing?.lng && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-600" /> 위치 정보
            </h3>
            <p className="text-sm text-gray-600 mb-3">{listing.address}</p>
            <div ref={mapRef} className="rounded-lg overflow-hidden border" style={{height:'300px'}} />
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(listing.title || '매물위치')},${listing.lat},${listing.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Navigation className="w-4 h-4" /> 카카오맵으로 길찾기
            </a>
          </div>
        )}

        {/* 연관 매물 */}
        {nearbyListings.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-bold mb-4">이 근처 다른 매물</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nearbyListings.map((item) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IR({ label, value, fw }: { label: string; value: string; fw?: boolean }) {
  return (
    <div className={fw ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function OB({ label, a }: { label: string; a: boolean }) {
  if (!a) return null;
  return (
    <span className="flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-green-50 text-green-700">
      <Check className="w-3 h-3" />{label}
    </span>
  );
}
