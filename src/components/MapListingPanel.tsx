'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
  ArrowLeft, ChevronLeft, ChevronRight, MapPin, Maximize2, Home,
  Building2, Layers, Compass, Bath, DoorOpen, Thermometer, Banknote,
  Check, X, Eye, Calendar, Train, TrendingUp, Clock, Ruler,
  ParkingCircle, Dog, Warehouse, Zap, CreditCard
} from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, formatPrice } from '@/lib/utils';
import { formatFloorWithTotal } from '@/lib/formatFloor';
import { displayTitle } from '@/lib/formatListingTitle';
import { displayAddressByAuth } from '@/lib/publicAddress';
import CompassDirection from '@/components/CompassDirection';
import Link from 'next/link';
import type { Listing } from '@/types';
import ListingLocationMap from './ListingLocationMap';
import RealPriceChart from './RealPriceChart';
import { useAuth } from '@/contexts/AuthContext';

interface MapListingPanelProps {
  listingId: number;
  onClose: () => void;
}

export default function MapListingPanel({ listingId, onClose }: MapListingPanelProps) {
  const { user } = useAuth();
  const isAuthed = !!user;
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);
    setShowFullDescription(false);
    const fetchData = async () => {
      const supabase = createClient();
      const [listingResult, imagesResult, featuresResult] = await Promise.all([
        supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', listingId),
      ]);
      const listingData: any = listingResult.data;
      // 저작권 보호: 크롤링 매물(source_site NOT NULL)은 사진을 내리고 정보만 노출
      const isCrawled = !!listingData?.source_site;
      setListing(listingData);
      setImages(isCrawled ? [] : (imagesResult.data || []));
      setFeatures(featuresResult.data || []);
      setLoading(false);
    };
    fetchData();
  }, [listingId]);

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-pulse">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-200 rounded-lg" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="aspect-[16/10] bg-gray-200" />
        <div className="p-4 space-y-3">
          <div className="h-5 w-20 bg-gray-200 rounded" />
          <div className="h-7 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6">
        <Building2 className="w-10 h-10 mb-2" />
        <p className="text-sm">매물 정보를 불러올 수 없습니다</p>
        <button onClick={onClose} className="mt-3 text-xs text-wishes-secondary hover:underline">목록으로 돌아가기</button>
      </div>
    );
  }

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);
  const dealColorMap: Record<string, string> = {
    '전세': 'bg-blue-500',
    '월세': 'bg-orange-500',
    '매매': 'bg-emerald-500',
    '단기': 'bg-purple-500',
  };
  const dealBgColor = dealColorMap[listing.deal] || 'bg-gray-500';

  const optionItems = [
    { key: 'parking', label: '주차', icon: ParkingCircle, value: listing.parking },
    { key: 'elevator', label: '엘리베이터', icon: Building2, value: listing.elevator },
    { key: 'pet', label: '반려동물', icon: Dog, value: listing.pet },
    { key: 'balcony', label: '발코니', icon: Warehouse, value: listing.balcony },
    { key: 'full_option', label: '풀옵션', icon: Zap, value: listing.full_option },
    { key: 'loan_available', label: '대출가능', icon: CreditCard, value: listing.loan_available },
  ];

  const hasOptions = optionItems.some(opt => opt.value);

  const mainImage = images.length > 0 ? images[currentImageIndex]?.url : null;

  const nextImage = () => {
    if (images.length > 1) setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = () => {
    if (images.length > 1) setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── 헤더: 뒤로가기 + 딠록번호 ── */}
      <div className="p-3 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-white sticky top-0 z-10">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          title="목록으로 돌아가기"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            매물번호 {listing.id}
          </span>
          {listing.views > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Eye className="w-3 h-3" /> {listing.views}
            </span>
          )}
        </div>
      </div>

      {/* ── 스크롤 영역 ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* ── 이미지 슬라이드 ── */}
        <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden group">
          {mainImage ? (
            <img
              src={mainImage}
              alt={displayTitle(listing)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gradient-to-br from-wishes-primary/5 via-gray-50 to-gray-100 relative">
              <Building2 className="w-16 h-16 mb-2 text-wishes-primary/30" />
              <span className="text-xs text-wishes-muted font-medium">사진 준비 중</span>
              <span className="text-[10px] text-gray-400 mt-1">직접 방문 시 현장 확인 가능</span>
            </div>
          )}

          {/* 거래유형 뱃지 */}
          <div className={`absolute top-3 left-3 ${dealBgColor} text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm`}>
            {listing.deal}
          </div>

          {/* 상태 뱃지 */}
          {listing.status !== '공개' && (
            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm">
              {listing.status}
            </div>
          )}

          {/* 이미지 네비게이션 */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums shadow-md">
                {currentImageIndex + 1} / {images.length}
              </div>
              {/* 이미지 인디케이터 점들 (5장 이하) */}
              {images.length <= 5 && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1">
                  {images.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 rounded-full transition-all ${
                        idx === currentImageIndex ? 'w-4 bg-white' : 'w-1 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 제목 & 가격 ── */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
            <span>{listing.type}</span>
            <span>·</span>
            <span>{listing.dong}</span>
            {listing.floor_current && (
              <>
                <span>·</span>
                <span>{formatFloorWithTotal(listing.floor_current, listing.floor_total)}</span>
              </>
            )}
            {listing.area_m2 && (
              <>
                <span>·</span>
                <span>전용 {listing.area_m2}㎡</span>
              </>
            )}
          </div>
          <p className="text-base font-bold text-gray-900 leading-snug">{displayTitle(listing)}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
            <MapPin className="w-3 h-3" />
            <span>{displayAddressByAuth(listing.address, listing.dong, isAuthed)}</span>
            {!isAuthed && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-400">
                상세 주소는 로그인 후 안내
              </span>
            )}
          </div>
        </div>

        {/* ── 가격 정보 (네모 스타일) ── */}
        <div className="p-4 border-b border-gray-100">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{listing.deal === '매매' ? '매매가' : listing.deal === '전세' ? '전세금' : listing.deal === '단기' ? '단기임대' : '월세'}</span>
              <span className="text-lg font-extrabold text-gray-900">{price.main}</span>
            </div>
            {listing.deal === '월세' && listing.deposit > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">보증금</span>
                <span className="text-sm font-semibold text-gray-700">{formatPrice(listing.deposit)}</span>
              </div>
            )}
            {listing.maintenance_fee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">관리비</span>
                <span className="text-sm font-semibold text-gray-700">월 {listing.maintenance_fee.toLocaleString()}만원</span>
              </div>
            )}
            {listing.maintenance_includes?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {listing.maintenance_includes.map((item: string) => (
                  <span key={item} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-md">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 상담 신청 버튼 (확장된 스티키 CTA) ── */}
        <div className="p-4 border-b border-gray-100">
          <Link
            href={`/contact?listing_id=${listing.id}&listing_title=${encodeURIComponent(listing.title || '')}`}
            className="group flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-wishes-primary to-wishes-primary/90 text-white text-center text-sm font-bold shadow-lg hover:shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
          >
            <span>이 매물 문의하기</span>
            <ChevronRight className="w-4 h-4 opacity-80 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <p className="text-[11px] text-wishes-muted text-center mt-2">
            위시스부동산 전문 중개사가 직접 연락드립니다
          </p>
        </div>

        {/* ── 매물설명 ── */}
        {listing.description && (
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-2.5">매물설명</h3>
            <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-line ${!showFullDescription ? 'line-clamp-4' : ''}`}>
              {listing.description}
            </p>
            {listing.description.length > 120 && (
              <button
                onClick={() => setShowFullDescription(!showFullDescription)}
                className="mt-2 text-xs text-wishes-secondary hover:underline font-medium"
              >
                {showFullDescription ? '접기' : '더보기'}
              </button>
            )}
          </div>
        )}

        {/* ── 핵시 정보 그리드 ── */}
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-3">매물 정보</h3>
          <div className="grid grid-cols-2 gap-y-4 gap-x-3">
            {listing.type && (
              <InfoItem icon={Home} label="매물유형" value={listing.type} />
            )}
            {listing.deal && (
              <InfoItem icon={Banknote} label="거래유형" value={listing.deal} />
            )}
            {listing.area_m2 && (
              <InfoItem icon={Maximize2} label="전용면적" value={`${listing.area_m2}㎡ (${sqmToPyeong(listing.area_m2)}평)`} />
            )}
            {listing.area_supply_m2 && (
              <InfoItem icon={Layers} label="공급면적" value={`${listing.area_supply_m2}㎡ (${sqmToPyeong(listing.area_supply_m2)}평)`} />
            )}
            {listing.floor_current && (
              <InfoItem icon={Building2} label="층수" value={formatFloorWithTotal(listing.floor_current, listing.floor_total)} />
            )}
            {listing.rooms && (
              <InfoItem icon={DoorOpen} label="방/욕실" value={`${listing.rooms}방${listing.bathrooms ? ` / ${listing.bathrooms}욕실` : ''}`} />
            )}
            {listing.direction && (
              <InfoItem icon={Compass} label="방향" value={listing.direction} />
            )}
            {listing.heating_type && (
              <InfoItem icon={Thermometer} label="난방" value={listing.heating_type} />
            )}
            {listing.built_year && (
              <InfoItem icon={Calendar} label="준공년도" value={listing.built_year} />
            )}
            {listing.available_date && (
              <InfoItem icon={Clock} label="입주가능일" value={listing.available_date} />
            )}
          </div>
        </div>

        {/* ── 방향 나침반 ── */}
        {listing.direction && (
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-wishes-secondary/60" />
              방향
            </h3>
            <CompassDirection direction={listing.direction} />
          </div>
        )}

        {/* ── 옵션/시설 ── */}
        {(hasOptions || features.length > 0) && (
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">옵션 · 시설</h3>
            <div className="flex flex-wrap gap-1.5">
              {optionItems.map((opt) => (
                <span
                  key={opt.key}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border font-medium ${
                    opt.value
                      ? 'bg-wishes-primary/5 text-wishes-primary border-wishes-primary/20'
                      : 'bg-gray-50 text-gray-300 border-gray-100'
                  }`}
                >
                  {opt.value ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {opt.label}
                </span>
              ))}
              {features.map((f: any) => (
                <span key={f.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border bg-wishes-primary/5 text-wishes-primary border-wishes-primary/20 font-medium">
                  <Check className="w-3 h-3" />
                  {f.feature}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── 주변 교통 정보 (실시간 API) ── */}
        {listing.lat && listing.lng && (
          <NearbyStationsSection listingId={listing.id} />
        )}

        {/* ── 실거래가 차트 (국토교통부 기준, 한 번만 노출) ── */}
        {listing.dong && (
          <div className="p-4 border-b border-gray-100">
            <RealPriceChart
              listingId={listing.id}
              dong={listing.dong}
              type={listing.type}
              deal={listing.deal}
            />
          </div>
        )}

        {/* ── 매물 위치 지도 (비로그인 시 동 단위까지만 라벨 노출) ── */}
        {listing.lat && listing.lng && (
          <div className="p-4 border-b border-gray-100">
            <ListingLocationMap
              lat={listing.lat}
              lng={listing.lng}
              address={displayAddressByAuth(listing.address, listing.dong, isAuthed)}
              title={isAuthed ? (listing.title || '') : ''}
            />
          </div>
        )}

        {/* ── 딠록 정보 ── */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                등록 {new Date(listing.created_at).toLocaleDateString('ko-KR')}
              </span>
              {listing.updated_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  수정 {new Date(listing.updated_at).toLocaleDateString('ko-KR')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}

/* ── 정보 아이템 컴포넌트 ── */
function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

// ── 주변 교통 정보 서브 컴포넌트 ──
function NearbyStationsSection({ listingId }: { listingId: number }) {
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await fetch(`/api/listings/${listingId}/nearby`);
        const json = await res.json();
        if (json.success && json.data?.stations) {
          setStations(json.data.stations);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
  }, [listingId]);

  return (
    <div className="p-4 border-b border-gray-100">
      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
        <Train className="w-4 h-4 text-blue-500/70" />
        주변 교통
      </h3>
      <div className="bg-blue-50/50 rounded-xl p-3.5">
        {loading ? (
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
        ) : stations.length > 0 ? (
          <div className="space-y-2">
            {stations.map((station: any, idx: number) => (
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
  );
}
