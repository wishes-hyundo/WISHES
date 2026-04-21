'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Maximize2, Home, Building2, Layers, Compass, Bath, DoorOpen, Thermometer, Banknote, Check, X, Eye, Calendar } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, formatPrice } from '@/lib/utils';
import Link from 'next/link';
import type { Listing } from '@/types';

interface MapListingPanelProps {
  listingId: number;
  onClose: () => void;
}

export default function MapListingPanel({ listingId, onClose }: MapListingPanelProps) {
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);
    const fetchData = async () => {
      const supabase = createClient();
      const [listingResult, imagesResult, featuresResult] = await Promise.all([
        supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', listingId),
      ]);
      setListing(listingResult.data);
      setImages(imagesResult.data || []);
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
  };
  const dealBgColor = dealColorMap[listing.deal] || 'bg-gray-500';

  const hasOptions = listing.parking || listing.elevator || listing.pet || listing.balcony || listing.full_option || listing.loan_available;

  const optionItems = [
    { key: 'parking', label: '주차', value: listing.parking },
    { key: 'elevator', label: '엘리베이터', value: listing.elevator },
    { key: 'pet', label: '반려동물', value: listing.pet },
    { key: 'balcony', label: '발코니', value: listing.balcony },
    { key: 'full_option', label: '풀옵션', value: listing.full_option },
    { key: 'loan_available', label: '대출가능', value: listing.loan_available },
  ];

  const mainImage = images.length > 0 ? images[currentImageIndex]?.url : null;

  const nextImage = () => {
    if (images.length > 1) setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = () => {
    if (images.length > 1) setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="h-full flex flex-col">
      {/* ─────── 헤더: 뒤로가기 + 타이틀 ─────── */}
      <div className="p-3 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-white sticky top-0 z-10">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          title="목록으로 돌아가기"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{listing.title}</p>
        </div>
        <Link
          href={`/listings/${listing.id}`}
          target="_blank"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          title="상세 페이지 열기"
        >
          <Maximize2 className="w-4 h-4" />
        </Link>
      </div>

      {/* ─────── 스크롤 영역 ─────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* ─────── 이미지 슬라이더 ─────── */}
        <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden group">
          {mainImage ? (
            <img
              src={mainImage}
              alt={listing.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Building2 className="w-12 h-12" />
            </div>
          )}

          {/* 거래유형 뱃지 */}
          <div className={`absolute top-3 left-3 ${dealBgColor} text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm`}>
            {listing.deal}
          </div>

          {/* 상태 뱃지 */}
          {listing.status !== '가용' && (
            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm">
              {listing.status}
            </div>
          )}

          {/* 이미지 네비게이션 */}
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
                {currentImageIndex + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {/* ─────── 가격 & 제목 ─────── */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              listing.deal === '전세' ? 'bg-blue-50 text-blue-600' :
              listing.deal === '월세' ? 'bg-orange-50 text-orange-600' :
              'bg-emerald-50 text-emerald-600'
            }`}>
              {price.label}
            </span>
            <span className="text-xs text-gray-400">{listing.type}</span>
          </div>
          <p className="text-xl font-extrabold text-gray-900 tracking-tight">{price.main}</p>
          {listing.maintenance_fee > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">관리비 월 {listing.maintenance_fee.toLocaleString()}만원</p>
          )}
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{listing.title}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
            <MapPin className="w-3 h-3" />
            <span>{listing.dong} · {listing.address?.split(' ').slice(-2).join(' ')}</span>
          </div>
        </div>

        {/* ─────── 핵심 정보 그리드 ─────── */}
        <div className="p-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            {listing.area_m2 && (
              <div className="flex items-start gap-2">
                <Maximize2 className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">전용면적</p>
                  <p className="text-sm font-semibold text-gray-800">{listing.area_m2}㎡ ({sqmToPyeong(listing.area_m2)}평)</p>
                </div>
              </div>
            )}
            {listing.area_supply_m2 && (
              <div className="flex items-start gap-2">
                <Layers className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">공급면적</p>
                  <p className="text-sm font-semibold text-gray-800">{listing.area_supply_m2}㎡ ({sqmToPyeong(listing.area_supply_m2)}평)</p>
                </div>
              </div>
            )}
            {listing.floor_current && (
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">층수</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {listing.floor_current}{listing.floor_total ? ` / ${listing.floor_total}층` : ''}
                  </p>
                </div>
              </div>
            )}
            {listing.rooms && (
              <div className="flex items-start gap-2">
                <DoorOpen className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">방/욕실</p>
                  <p className="text-sm font-semibold text-gray-800">{listing.rooms}방 {listing.bathrooms ? `/ ${listing.bathrooms}욕실` : ''}</p>
                </div>
              </div>
            )}
            {listing.direction && (
              <div className="flex items-start gap-2">
                <Compass className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">방향</p>
                  <p className="text-sm font-semibold text-gray-800">{listing.direction}</p>
                </div>
              </div>
            )}
            {listing.heating_type && (
              <div className="flex items-start gap-2">
                <Thermometer className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">난방</p>
                  <p className="text-sm font-semibold text-gray-800">{listing.heating_type}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─────── 옵션/시설 ─────── */}
        {hasOptions && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2.5">옵션 · 시설</p>
            <div className="flex flex-wrap gap-1.5">
              {optionItems.map((opt) => (
                <span
                  key={opt.key}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${
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
                <span key={f.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-wishes-primary/5 text-wishes-primary border-wishes-primary/20 font-medium">
                  <Check className="w-3 h-3" />
                  {f.feature}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─────── 설명 ─────── */}
        {listing.description && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">상세 설명</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line line-clamp-6">
              {listing.description}
            </p>
          </div>
        )}

        {/* ─────── 부가정보 ─────── */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{listing.views || 0}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(listing.created_at).toLocaleDateString('ko-KR')}</span>
            </div>
            <span className="text-[10px]">매물번호 {listing.id}</span>
          </div>
        </div>

        {/* ─────── 상담 신청 버튼 ─────── */}
        <div className="p-4">
          <Link
            href={`/contact?listing_id=${listing.id}&listing_title=${encodeURIComponent(listing.title)}`}
            className="block w-full py-3.5 rounded-xl bg-wishes-primary text-white text-center text-sm font-bold shadow-md hover:shadow-lg hover:bg-wishes-primary/90 transition-all"
          >
            온라인 상담 신청
          </Link>
          <Link
            href={`/listings/${listing.id}`}
            target="_blank"
            className="block w-full mt-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 text-center text-sm font-bold hover:border-wishes-primary hover:text-wishes-primary transition-all"
          >
            상세 페이지 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
