'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { formatPrice } from '@/lib/utils';
import {
  ArrowLeft,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Building2,
  Layers,
  Home,
  Compass,
  Flame as FlameIcon,
  Eye,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface MapListingPanelProps {
  listingId: number;
  onClose: () => void;
}

const supabase = createClient();

const sqmToPyeong = (area: number) => (area / 3.3).toFixed(1);

const formatAmount = (amount: number) => {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}` : `${uk}억`;
  }
  return `${amount.toLocaleString('ko-KR')}만`;
};

const getDealColor = (deal: string) => {
  switch (deal) {
    case '전세': return 'bg-blue-500';
    case '월세': return 'bg-orange-500';
    case '매매': return 'bg-emerald-500';
    default: return 'bg-gray-400';
  }
};

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
      const [listingRes, imagesRes, featuresRes] = await Promise.all([
        supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase
          .from('listing_images')
          .select('*')
          .eq('listing_id', listingId)
          .order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('*').eq('listing_id', listingId),
      ]);

      if (listingRes.data) setListing(listingRes.data);
      if (imagesRes.data) setImages(imagesRes.data);
      if (featuresRes.data) setFeatures(featuresRes.data);
      setLoading(false);
    };

    fetchData();
  }, [listingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-3 border-wishes-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <Building2 className="w-10 h-10" />
        <p className="text-sm">매물 정보를 불러올 수 없습니다</p>
        <button onClick={onClose} className="text-xs text-wishes-secondary underline">
          돌아가기
        </button>
      </div>
    );
  }

  const priceDisplay =
    listing.deal === '매매'
      ? formatAmount(listing.price || 0)
      : listing.deal === '전세'
        ? formatAmount(listing.deposit)
        : `${formatAmount(listing.deposit)} / 월 ${listing.monthly || 0}만`;

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-wishes-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">목록</span>
        </button>
        <Link
          href={`/listings/${listing.id}`}
          className="flex items-center gap-1 text-xs text-wishes-secondary hover:underline"
        >
          상세보기 <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* 스크롤 가능 영역 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* 이미지 슬라이더 */}
        <div className="relative aspect-[4/3] bg-gray-100">
          {images.length > 0 ? (
            <>
              <img
                src={images[currentImageIndex]?.url}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {currentImageIndex + 1} / {images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="w-12 h-12 text-gray-300" />
            </div>
          )}
          {/* 거래유형 배지 */}
          <span
            className={`absolute top-3 left-3 px-3 py-1 text-xs font-bold text-white rounded-lg shadow-md ${getDealColor(
              listing.deal
            )}`}
          >
            {listing.deal}
          </span>
        </div>

        {/* 가격 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {listing.deal === '매매' ? '매매가' : listing.deal === '전세' ? '전세금' : '보증금/월세'}
          </p>
          <p className="text-2xl font-bold text-wishes-primary">{priceDisplay}</p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{listing.title}</p>
        </div>

        {/* 기본 정보 그리드 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            {(listing.area_m2 || listing.area) ? (
              <div className="flex items-center gap-2 text-sm">
                <Maximize2 className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">면적</p>
                  <p className="font-medium text-gray-800">
                    {listing.area_m2 || listing.area}m&sup2; ({sqmToPyeong(listing.area_m2 || listing.area)}평)
                  </p>
                </div>
              </div>
            ) : null}
            {(listing.floor_current || listing.floor) ? (
              <div className="flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">층수</p>
                  <p className="font-medium text-gray-800">
                    {listing.floor_current || listing.floor}
                    {listing.floor_total ? `/${listing.floor_total}층` : '층'}
                  </p>
                </div>
              </div>
            ) : null}
            {listing.rooms ? (
              <div className="flex items-center gap-2 text-sm">
                <Home className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">방/욕실</p>
                  <p className="font-medium text-gray-800">
                    {listing.rooms}방 {listing.bathrooms ? `/ ${listing.bathrooms}욕실` : ''}
                  </p>
                </div>
              </div>
            ) : null}
            {listing.direction ? (
              <div className="flex items-center gap-2 text-sm">
                <Compass className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">방향</p>
                  <p className="font-medium text-gray-800">{listing.direction}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 옵쥌/편의시설 */}
        {features.length > 0 && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">옵션/편의시설</p>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f: any, i: number) => (
                <span
                  key={i}
                  className="px-2.5 py-1 text-xs bg-gray-50 text-gray-600 rounded-full border border-gray-200"
                >
                  {f.feature || f.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 기본 옵션 태그 (parking, elevator, pet) */}
        {(listing.parking || listing.elevator || listing.pet) && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">편의시설</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.parking && (
                <span className="px-2.5 py-1 text-xs bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20">
                  주차가능
                </span>
              )}
              {listing.elevator && (
                <span className="px-2.5 py-1 text-xs bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20">
                  엘리베이터
                </span>
              )}
              {listing.pet && (
                <span className="px-2.5 py-1 text-xs bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
                  반려동물
                </span>
              )}
            </div>
          </div>
        )}

        {/* 설명 */}
        {listing.description && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">상세 설명</p>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed line-clamp-6">
              {listing.description}
            </p>
          </div>
        )}

        {/* 위치 정보 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-2">위치</p>
          <p className="text-sm text-gray-600">{listing.address}</p>
          {listing.dong && (
            <p className="text-xs text-gray-400 mt-1">{listing.dong}</p>
          )}
        </div>

        {/* 조회수 + 등록일 */}
        <div className="px-4 py-3 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            {listing.views > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {listing.views}
              </span>
            )}
            <span>W-{listing.id}</span>
          </div>
          {listing.created_at && (
            <span>
              {new Date(listing.created_at).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>

        {/* 상세페이지 이동 버튼 */}
        <div className="px-4 py-4">
          <Link
            href={`/listings/${listing.id}`}
            className="block w-full py-3 text-center text-sm font-bold text-white bg-wishes-primary rounded-xl hover:bg-wishes-primary/90 transition-colors shadow-md"
          >
            매물 상세정보 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
