'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
  ChevronLeft, ChevronRight, MapPin, Maximize2, Home,
  Building2, Layers, Compass, DoorOpen, Thermometer, Banknote,
  Check, X, Eye, Calendar, Train, Clock,
  ParkingCircle, Dog, Warehouse, Zap, CreditCard, Briefcase, FileText,
  Megaphone, Users, LogIn, Timer, Phone
} from 'lucide-react';
import { getFormattedPrice, sqmToPyeong, formatPrice } from '@/lib/utils';
import { formatFloorWithTotal } from '@/lib/formatFloor';
import { displayTitle } from '@/lib/formatListingTitle';
import { displayDescription } from '@/lib/formatListingDescription';
import { displayAddressByAuth } from '@/lib/publicAddress';
import { filterSelfHosted } from '@/lib/image-policy';
import CompassDirection from '@/components/CompassDirection';
import InquiryModal from '@/components/InquiryModal';
import AgentContactModal, { type AgentInfo } from '@/components/AgentContactModal';
import { INTERIOR_FEATURES, SECURITY_FEATURES, hasFeatureWithBools } from '@/lib/featureIcons';
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
  const [inquiryOpen, setInquiryOpen] = useState(false);
  // L-panel-agent (2026-04-24): 기존 '닫기/상세보기/문의하기' 3버튼 제거 →
  //   '담당자에게 연결' 단일 버튼 + AgentContactModal 구조로 통합.
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  // 담당 중개사 프로필 (listing.created_by 로 /api/agent/[id] 조회). 없으면 폴백.
  const [agentProfile, setAgentProfile] = useState<{
    name: string | null;
    avatar_url: string | null;
    phone: string | null;
    office_name: string | null;
    office_phone: string | null;
    office_address: string | null;
    registration_no: string | null;
    career_years: number | null;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);
    setShowFullDescription(false);
    const fetchData = async () => {
      const supabase = createClient();
      // 고객용 화이트리스트 (민감 필드 description, source_url, contact, special_notes, building_name 제외)
      const LISTING_COLUMNS = [
        'id', 'title', 'type', 'deal', 'status', 'dong', 'gu', 'address', 'address_detail',
        'lat', 'lng', 'deposit', 'monthly', 'price',
        'area_m2', 'area_supply_m2', 'floor_current', 'floor_total', 'rooms', 'bathrooms',
        'direction', 'heating_type', 'available_date', 'built_year',
        'ai_description', 'ai_title', 'ai_generated_at',
        'seo_tags', 'seo_keywords', 'seo_meta_description',
        'building_purpose',
        'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
        'maintenance_fee', 'maintenance_includes',
        'entrance_type', 'lease_period',
        'business_type', 'goodwill_fee', 'vat_included', 'usage_approved',
        'electric_capacity', 'signage_available', 'meeting_room',
        'parking_spaces', 'rights_fee',
        'station_name', 'station_distance',
        'views', 'created_at', 'updated_at', 'source_site',
        // L-panel-agent (2026-04-24): 담당자 모달 — 자체 등록 매물의 중개사 프로필 fetch 용
        'created_by',
      ].join(', ');
      const [listingResult, imagesResult, featuresResult] = await Promise.all([
        supabase.from('listings').select(LISTING_COLUMNS).eq('id', listingId).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', listingId),
      ]);
      const listingData: any = listingResult.data;
      // ※ 저작권 보호 + 자체 업로드 통과
      //   - 크롤링 매물의 외부 원본 이미지는 차단
      //   - 중개사가 직접 올린 자체 업로드 이미지(wishes.co.kr·supabase·R2)는 통과
      const isCrawled = !!listingData?.source_site;
      const rawImages = imagesResult.data || [];
      const safeImages = isCrawled ? filterSelfHosted(rawImages) : rawImages;
      setListing(listingData);
      setImages(safeImages);
      setFeatures(featuresResult.data || []);
      setLoading(false);

      // 담당자 프로필 비동기 fetch (실패해도 매물 상세는 정상 표시)
      setAgentProfile(null);
      const createdBy = listingData?.created_by;
      if (createdBy && !isCrawled) {
        try {
          const r = await fetch(`/api/agent/${createdBy}`);
          if (r.ok) {
            const json = await r.json();
            setAgentProfile({
              name: json.name || null,
              avatar_url: json.avatar_url || null,
              phone: json.phone || null,
              office_name: json.office_name || null,
              office_phone: json.office_phone || null,
              office_address: json.office_address || null,
              registration_no: json.registration_no || null,
              career_years: (typeof json.career_years === 'number' ? json.career_years : null),
            });
          }
        } catch { /* 폴백으로 진행 */ }
      }
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
    <>
    <div className="h-full flex flex-col">
      {/* ── 헤더: 매물번호 + 조회수 (L-panel-close: ArrowLeft '닫기' 제거 — 지도 핀 클릭으로 전환 유도) ── */}
      <div className="p-3 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-white sticky top-0 z-10">
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
              decoding="async"
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

        {/* ── (CTA는 하단 고정 액션 바로 이동: '상세보기' + '문의하기' 2버튼) ── */}

        {/* ── 핵심 정보 그리드 ── */}
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
            {/* ── 상업·상가 매물 전용 필드 ── */}
            {listing.parking_spaces != null && listing.parking_spaces > 0 && (
              <InfoItem icon={ParkingCircle} label="주차대수" value={`${listing.parking_spaces}대`} />
            )}
            {listing.station_name && (
              <InfoItem
                icon={Train}
                label="역세권"
                value={listing.station_distance
                  ? `${listing.station_name} ${listing.station_distance}m`
                  : listing.station_name}
              />
            )}
            {listing.business_type && (
              <InfoItem icon={Briefcase} label="업종" value={listing.business_type} />
            )}
            {listing.building_purpose && (
              <InfoItem icon={Building2} label="건물용도" value={listing.building_purpose} />
            )}
            {listing.usage_approved && (
              <InfoItem icon={FileText} label="사용승인" value={listing.usage_approved} />
            )}
            {listing.electric_capacity && (
              <InfoItem icon={Zap} label="전력용량" value={listing.electric_capacity} />
            )}
            {listing.signage_available && (
              <InfoItem icon={Megaphone} label="간판설치" value="가능" />
            )}
            {listing.meeting_room != null && listing.meeting_room > 0 && (
              <InfoItem icon={Users} label="회의실" value={`${listing.meeting_room}개`} />
            )}
            {listing.entrance_type && (
              <InfoItem icon={LogIn} label="출입형태" value={listing.entrance_type} />
            )}
            {listing.lease_period && (
              <InfoItem icon={Timer} label="임대기간" value={listing.lease_period} />
            )}
            {listing.rights_fee != null && listing.rights_fee > 0 && (
              <InfoItem icon={CreditCard} label="권리금" value={`${formatPrice(listing.rights_fee)}`} />
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

        {/* ── L-panel-v2 (2026-04-24): 옵션/시설 아이콘 그리드 — 내부시설 / 보안 2섹션 ── */}
        {(() => {
          const mergedFeatures: string[] = [];
          features.forEach((f: any) => mergedFeatures.push(f.feature));
          if (Array.isArray(listing.features)) listing.features.forEach((f: string) => mergedFeatures.push(f));
          const bools = { elevator: !!listing.elevator, full_option: !!listing.full_option };
          const interiorHits = INTERIOR_FEATURES.filter((s) => hasFeatureWithBools(mergedFeatures, s, bools));
          const securityHits = SECURITY_FEATURES.filter((s) => hasFeatureWithBools(mergedFeatures, s, bools));
          const boolBadges: { label: string; on: boolean }[] = [
            { label: '주차', on: !!listing.parking },
            { label: '반려동물', on: !!listing.pet },
            { label: '발코니', on: !!listing.balcony },
            { label: '풀옵션', on: !!listing.full_option },
            { label: '대출가능', on: !!listing.loan_available },
          ].filter(b => b.on);
          if (interiorHits.length + securityHits.length + boolBadges.length === 0) return null;
          return (
            <div className="p-4 border-b border-gray-100 space-y-4">
              {interiorHits.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2.5">내부 시설</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {interiorHits.map((spec) => {
                      const Icon = spec.icon;
                      return (
                        <div key={spec.label} className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-gray-50">
                          <Icon className="w-5 h-5 text-gray-500" />
                          <span className="text-[11px] text-gray-800">{spec.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {securityHits.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2.5">보안 및 기타</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {securityHits.map((spec) => {
                      const Icon = spec.icon;
                      return (
                        <div key={spec.label} className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-gray-50">
                          <Icon className="w-5 h-5 text-gray-500" />
                          <span className="text-[11px] text-gray-800">{spec.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {boolBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {boolBadges.map((b) => (
                    <span key={b.label} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                      <Check className="w-3 h-3" /> {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── L-panel-v2: 허위매물 차단 4단 검증 배지 ── */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 border border-green-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-green-600 flex-shrink-0 mt-0.5"><path d="M12 2 l8 4 v6 c0 5 -3.5 8.5 -8 10 c-4.5 -1.5 -8 -5 -8 -10 v-6 z"/><path d="M9 12 l2 2 l4 -4"/></svg>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-green-800 mb-0.5">허위매물 차단 4단 검증 완료</div>
              <div className="text-[11px] text-green-700 leading-relaxed">
                건축물대장 일치 · 사용승인 확인 · 등기부 열람 · 현장확인
                {listing.last_verified_at && (
                  <> · <span className="font-medium">{new Date(listing.last_verified_at).toLocaleDateString('ko-KR')}</span></>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── L-panel-v2 (2026-04-24): 매물 설명 — 최하단 배치, 제목+첫단락 노출 + 더보기/접기 ── */}
        {(() => {
          const aiTitle: string | null = (listing as any)?.ai_title || null;
          const descText = displayDescription(listing);
          if (!descText) return null;
          const paragraphs = String(descText).split(/\n{2,}/).map((s: string) => s.trim()).filter(Boolean);
          if (paragraphs.length === 0) return null;
          const [first, ...rest] = paragraphs;
          return (
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2.5">매물 설명</h3>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                {aiTitle && (
                  <p className="text-[15px] font-semibold text-gray-900 leading-snug mb-2.5">{aiTitle}</p>
                )}
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{first}</p>
                {rest.length > 0 && (
                  <>
                    {showFullDescription && rest.map((para: string, i: number) => (
                      <p key={i} className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mt-3">{para}</p>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowFullDescription(v => !v)}
                      className="mt-3 pt-3 w-full border-t border-gray-100 text-xs font-medium text-wishes-primary hover:underline flex items-center justify-center gap-1"
                    >
                      {showFullDescription ? '접기 ↑' : '더보기 ↓'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* ── 등록 정보 ── */}
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

      {/* ── 하단 고정 액션 바: 담당자에게 연결 단일 버튼 (L-panel-agent, 2026-04-24) ── */}
      <div className="shrink-0 border-t border-gray-100 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={() => setAgentModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-wishes-primary to-wishes-primary/90 text-white text-sm font-bold shadow-lg hover:shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <Phone className="w-4 h-4" />
          <span>담당자에게 연결</span>
        </button>
      </div>
    </div>

    {/* ── 담당자 정보 모달 (프로필·전화·사무소·예약/카톡) ── */}
    <AgentContactModal
      open={agentModalOpen}
      onClose={() => setAgentModalOpen(false)}
      agent={buildAgentInfo(listing, agentProfile)}
      listingId={listing.id}
      listingTitle={displayTitle(listing)}
      onRequestInquiry={() => { setAgentModalOpen(false); setInquiryOpen(true); }}
      onRequestVisit={() => { setAgentModalOpen(false); setInquiryOpen(true); }}
    />

    {/* ── 인라인 문의 모달 (카톡 문의·방문 예약 진입점, 리드 캡처용) ── */}
    <InquiryModal
      open={inquiryOpen}
      onClose={() => setInquiryOpen(false)}
      context="listing"
      listingId={listing.id}
      listingTitle={displayTitle(listing)}
      source="/map"
    />
    </>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   buildAgentInfo — listing + 비동기 fetch 된 agent profile 로 AgentInfo 구성
   ------------------------------------------------
   우선순위:
   1) /api/agent/{listing.created_by} 로 fetch 한 profile (name/avatar_url/phone)
   2) listing.contact_name / listing.contact (외부 크롤러 매물이 직접 포함 시)
   3) 폴백: 위시스부동산 통합 컨택
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function buildAgentInfo(
  listing: any,
  agentProfile: {
    name: string | null;
    avatar_url: string | null;
    phone: string | null;
    office_name?: string | null;
    office_phone?: string | null;
    office_address?: string | null;
    registration_no?: string | null;
    career_years?: number | null;
  } | null = null
): AgentInfo {
  // 위시스부동산 통합 컨택 (폴백 & 사무소 정보 공통)
  const OFFICE = {
    officeName: '위시스부동산 공인중개사사무소',
    officePhone: '02-6953-7001',
    officeAddress: '서울시 용산구 한강대로',
    responseRate: 98,
    avgResponseMinutes: 12,
  };
  const FALLBACK: AgentInfo = {
    name: '위시스부동산',
    registrationNo: null,
    careerYears: null,
    phone: null,
    avatarUrl: null,
    ...OFFICE,
  };

  // 1순위 — profiles 테이블에서 가져온 실제 중개사 프로필 (L-agent-profile)
  if (agentProfile && (agentProfile.name || agentProfile.avatar_url || agentProfile.phone || agentProfile.office_name)) {
    return {
      ...FALLBACK,
      name: agentProfile.name || FALLBACK.name,
      phone: agentProfile.phone || FALLBACK.phone,
      avatarUrl: agentProfile.avatar_url || null,
      officeName: agentProfile.office_name || FALLBACK.officeName,
      officePhone: agentProfile.office_phone || FALLBACK.officePhone,
      officeAddress: agentProfile.office_address || FALLBACK.officeAddress,
      registrationNo: agentProfile.registration_no || null,
      careerYears: agentProfile.career_years ?? null,
    };
  }

  // 2순위 — listing 자체에 박힌 연락처
  const contactPhone = listing?.contact || null;
  const contactName = listing?.contact_name || null;
  if (contactPhone || contactName) {
    return {
      ...FALLBACK,
      name: contactName || FALLBACK.name,
      phone: contactPhone || FALLBACK.phone,
    };
  }

  // 3순위 — 폴백
  return FALLBACK;
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
