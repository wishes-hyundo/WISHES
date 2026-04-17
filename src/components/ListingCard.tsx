'use client';

import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, Eye, Hash, Flame, Sparkles, Heart, Home, Camera, MessageCircleMore, BarChart3, Check as CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFloor } from '@/lib/formatFloor';
import { useFavorites } from '@/contexts/FavoritesContext';
import type { Listing } from '@/types';
import { getWatermarkedUrl } from '@/lib/imageUrl';

// NEW: 7일 이내 등록 / HOT: 조회수 50 이상
const isNew = (createdAt: string) => {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
};
const isHot = (views?: number) => (views || 0) >= 50;

interface ListingCardProps {
  listing: Listing;
  compact?: boolean;
  onHover?: (id: number | null) => void;
  noLink?: boolean;
}

const sqmToPyeong = (area: number) => {
  return (area / 3.3).toFixed(1);
};

const getDealColor = (deal: string) => {
  switch (deal) {
    case '전세':
      return 'bg-wishes-secondary text-white';
    case '월세':
      return 'bg-emerald-500 text-white';
    case '매매':
      return 'bg-wishes-accent text-white';
    default:
      return 'bg-gray-400 text-white';
  }
};

const getDealBgGradient = (deal: string) => {
  switch (deal) {
    case '전세':
      return 'from-wishes-secondary/20 to-wishes-secondary/0';
    case '월세':
      return 'from-emerald-500/20 to-emerald-500/0';
    case '매매':
      return 'from-wishes-accent/20 to-wishes-accent/0';
    default:
      return 'from-gray-400/20 to-gray-400/0';
  }
};

const formatAmount = (amount: number) => {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}` : `${uk}억`;
  }
  return `${amount.toLocaleString('ko-KR')}`;
};


const formatPrice = (listing: Listing) => {
  if (listing.deal === '매매') {
    return formatAmount(listing.price || 0);
  } else if (listing.deal === '전세') {
    return `전세 ${formatAmount(listing.deposit)}`;
  } else {
    return `${formatAmount(listing.deposit)}/${listing.monthly || 0}`;
  }
};

const getPriceLabel = (listing: Listing) => {
  if (listing.deal === '매매') return '매매가';
  if (listing.deal === '전세') return '전세금';
  return '보증금/월세';
};

export function ListingCard({ listing, compact = false, onHover, noLink = false }: ListingCardProps) {
  const { isFavorite, toggleFavorite, isInCompare, addToCompare, removeFromCompare } = useFavorites();
  const liked = isFavorite(listing.id);
  const comparing = isInCompare(listing.id);
  const handleCompareToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (comparing) removeFromCompare(listing.id);
    else addToCompare(listing.id);
  };
  // ※ 크롤링 매물(source_site 존재) — 저작권 보호로 사진은 문의 시 안내
  const isAd = !!(listing as any).source_site;
  // Supabase 조인 결과(listing_images) 또는 기존 images 필드에서 이미지 추출
  const listingImages = (listing as any).listing_images || listing.images || [];
  // 광고 매물은 썸네일 무시 (서버에서도 비웠지만 안전장치)
  const thumbUrl = !isAd && listingImages.length > 0 && listingImages[0].url ? listingImages[0].url : null;
  const price = formatPrice(listing);

  if (compact) {
    const Wrapper = noLink ? 'div' : Link;
    const wrapperProps = noLink
      ? {}
      : { href: `/listings/${listing.id}` };

    return (
      <Wrapper
        {...(wrapperProps as any)}
        className="group flex bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-wishes-secondary/30 transition-all h-28"
        onMouseEnter={() => onHover?.(listing.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        {/* 이미지 */}
        <div className="w-28 h-28 shrink-0 relative overflow-hidden bg-gray-100">
          {thumbUrl ? (
            <img
              src={getWatermarkedUrl(thumbUrl)}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
          ) : isAd ? (
            // 광고 매물 플레이스홀더 (크롤링 매물 - 저작권 보호)
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-wishes-primary/90 via-wishes-primary to-wishes-secondary/90 relative text-white">
              <Camera className="w-6 h-6 mb-1 opacity-70" strokeWidth={1.6} />
              <span className="text-[9px] font-bold tracking-wide">광고 매물</span>
              <span className="text-[8px] opacity-80 mt-0.5">문의 시 안내</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-wishes-primary/10 via-emerald-50 to-white relative">
              <div className="absolute inset-0 opacity-[0.08]" style={{backgroundImage:"radial-gradient(circle at 30% 30%, #059669 1px, transparent 1px)",backgroundSize:"14px 14px"}} />
              <div className="relative w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center ring-1 ring-wishes-primary/15">
                <Home className="w-5 h-5 text-wishes-primary" strokeWidth={1.8} />
              </div>
            </div>
          )}
          <span className={cn(
            'absolute top-1 left-1 px-2 py-0.5 text-xs font-bold rounded-md',
            getDealColor(listing.deal)
          )}>
            {listing.deal}
          </span>
        </div>

        {/* 정보 */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-wishes-primary truncate">{price}</p>
              <span className="text-[10px] text-gray-400 font-mono shrink-0">매물번호 {listing.id}</span>
            </div>
            <p className="text-xs text-gray-600 truncate mt-0.5">{listing.title}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-wishes-muted">
            <span>{listing.area_m2 || listing.area || 0}㎡</span>
            <span>·</span>
            <span>{formatFloor(listing)}</span>
            {(listing as any).views > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{(listing as any).views}</span>
              </>
            )}
          </div>
        </div>
      </Wrapper>
    );
  }

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group card-premium block overflow-hidden"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* 이미지 영역 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
        {/* 배경 이미지 */}
        {thumbUrl ? (
          <img
            src={getWatermarkedUrl(thumbUrl)}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : isAd ? (
          // 광고 매물 플레이스홀더 (크롤링 매물 - 저작권 보호)
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary relative overflow-hidden">
            {/* 패턴 오버레이 */}
            <div className="absolute inset-0 opacity-[0.08]" style={{backgroundImage:"radial-gradient(circle at 20% 30%, #fff 1.5px, transparent 1.5px), radial-gradient(circle at 75% 70%, #fff 1.5px, transparent 1.5px)",backgroundSize:"26px 26px"}} />
            {/* 골드 라인 장식 */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-wishes-accent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-wishes-accent to-transparent" />

            <div className="relative flex flex-col items-center text-white text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 shadow-lg flex items-center justify-center mb-3">
                <Camera className="w-7 h-7 text-white" strokeWidth={1.6} />
              </div>
              <span className="inline-block px-3 py-1 mb-2 text-[10px] font-bold tracking-[0.2em] rounded-full bg-wishes-accent text-wishes-primary">
                광고 매물
              </span>
              <p className="text-sm font-semibold leading-tight">사진은 문의 시 안내드립니다</p>
              <p className="text-[11px] opacity-80 mt-1 flex items-center gap-1">
                <MessageCircleMore className="w-3 h-3" /> WISHES 전담 중개사 응대
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-wishes-primary/10 via-emerald-50 to-white relative">
            <div className="absolute inset-0 opacity-[0.08]" style={{backgroundImage:"radial-gradient(circle at 25% 25%, #059669 1.5px, transparent 1.5px), radial-gradient(circle at 75% 75%, #059669 1.5px, transparent 1.5px)",backgroundSize:"22px 22px"}} />
            <div className="relative flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center ring-1 ring-wishes-primary/15">
                <Home className="w-8 h-8 text-wishes-primary" strokeWidth={1.8} />
              </div>
              <span className="mt-2 text-[11px] font-semibold text-wishes-primary/80">이미지 준비 중</span>
            </div>
          </div>
        )}

        {/* 그래디언트 오버레이 */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t transition-opacity group-hover:opacity-60 duration-300',
          getDealBgGradient(listing.deal)
        )}></div>

        {/* 좌측 배지들 (우측은 ListingCardActions 영역) */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {/* 거래 유형 배지 */}
          <span className={cn(
            'px-3 py-1 text-xs font-bold rounded-lg shadow-lg backdrop-blur-sm w-fit',
            getDealColor(listing.deal)
          )}>
            {listing.deal}
          </span>

          {/* NEW 배지 */}
          {isNew(listing.created_at) && (
            <span className="flex items-center gap-0.5 px-2 py-1 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-lg shadow-sm w-fit">
              <Sparkles className="w-3 h-3" /> NEW
            </span>
          )}

          {/* HOT 배지 */}
          {isHot((listing as any).views) && (
            <span className="flex items-center gap-0.5 px-2 py-1 text-xs font-bold bg-red-500 text-white rounded-lg shadow-sm w-fit">
              <Flame className="w-3 h-3" /> HOT
            </span>
          )}
        </div>

        {/* 우측 상단 액션 그룹 (찜 + 비교) */}
        <div className="absolute top-3 right-3 flex gap-1.5 z-10">
          {/* 비교 추가/해제 */}
          <button
            onClick={handleCompareToggle}
            className={cn(
              'w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center shadow-md transition-all',
              comparing
                ? 'bg-wishes-primary text-white'
                : 'bg-white/80 hover:bg-white text-gray-500'
            )}
            aria-label={comparing ? '비교 해제' : '비교 추가'}
            title={comparing ? '비교 해제' : '비교에 추가'}
          >
            {comparing ? <CheckIcon className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
          </button>
          {/* 찜 */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(listing.id); }}
            className="w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-all"
            aria-label={liked ? '찜 해제' : '찜하기'}
          >
            <Heart className={cn('w-4.5 h-4.5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-gray-400')} />
          </button>
        </div>

        {/* 우측 하단 타입 배지 */}
        <div className="absolute bottom-3 right-3">
          <span className="px-3 py-1 text-xs font-semibold bg-white/90 text-wishes-primary rounded-lg shadow-md backdrop-blur-sm">
            {listing.type}
          </span>
        </div>
      </div>

      {/* 정보 영역 */}
      <div className="p-4 space-y-4">
        {/* 가격 */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-wishes-muted/80 uppercase tracking-wider">{getPriceLabel(listing)}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-wishes-primary">{price}</p>
            {listing.deal === '월세' && (
              <p className="text-sm text-wishes-muted">만원</p>
            )}
          </div>
        </div>

        {/* 제목 */}
        <p className="text-sm font-semibold text-wishes-text line-clamp-2 group-hover:text-wishes-secondary transition-colors">
          {listing.title}
        </p>

        {/* 기본 정보 */}
        <div className="flex items-center gap-4 text-xs text-wishes-muted">
          {(listing.area_m2 || listing.area) ? (
            <div className="flex items-center gap-1">
              <Maximize className="w-4 h-4 text-wishes-secondary/60" />
              <span>{listing.area_m2 || listing.area}㎡</span>
              <span className="text-gray-400">({sqmToPyeong(listing.area_m2 || listing.area)}평)</span>
            </div>
          ) : null}
          {(listing.floor_current || listing.floor) && (
            <div className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-wishes-secondary/60" />
              <span>{formatFloor(listing)}</span>
            </div>
          )}
        </div>

        {/* 위치 */}
        <div className="flex items-center gap-1 text-xs text-wishes-muted">
          <MapPin className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
          <span className="truncate">{listing.dong}</span>
        </div>

        {/* 옵션 태그 */}
        <div className="flex flex-wrap gap-2 pt-2">
          {listing.parking && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20 hover:bg-wishes-secondary/20 transition-colors">
              🚗 주차
            </span>
          )}
          {listing.elevator && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20 hover:bg-wishes-accent/20 transition-colors">
              🚡 엘리베이터
            </span>
          )}
          {listing.pet && (
            <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
              🐾 반려동물
            </span>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-wishes-muted font-mono flex items-center gap-1">
              <Hash className="w-3 h-3" />
              매물번호 {listing.id}
            </span>
            {(listing as any).views > 0 && (
              <span className="text-wishes-muted flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {(listing as any).views}
              </span>
            )}
          </div>
          <span className="text-wishes-muted flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {listing.created_at ? new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' }) : '방금 전'}
          </span>
        </div>
      </div>
    </Link>
  );
}
