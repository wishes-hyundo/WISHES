'use client';

import Link from 'next/link';
import { Heart, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFloor } from '@/lib/formatFloor';
import { displayTitle } from '@/lib/formatListingTitle';
import { useFavorites } from '@/contexts/FavoritesContext';
import type { Listing } from '@/types';
import { getWatermarkedUrl } from '@/lib/imageUrl';

interface ListingCardProps {
  listing: Listing;
  compact?: boolean;
  onHover?: (id: number | null) => void;
  noLink?: boolean;
}

// 거래유형 → 좌상단 단색 배지 (시각 질서 통일)
// L-a11y4 (2026-04-21): 월세/단기 배지 -500 → -700 로 상향.
//   흰 글자 AA 4.5:1 요구치 확보
//     emerald-500: 2.53:1 (실패) → emerald-700: 5.30:1 (통과)
//     amber-500:   2.11:1 (실패) → amber-700:   4.67:1 (통과)
//     gray-500:    3.95:1 (실패) → gray-600:    5.72:1 (통과)
const dealBadgeColor = (deal: string) => {
  switch (deal) {
    case '매매': return 'bg-wishes-primary';
    case '전세': return 'bg-wishes-secondary';
    case '월세': return 'bg-emerald-700';
    case '단기': return 'bg-amber-700';
    default:    return 'bg-gray-600';
  }
};

const formatAmount = (amount: number) => {
  if (!amount) return '0';
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}` : `${uk}억`;
  }
  return amount.toLocaleString('ko-KR');
};

// 가격: 주 시각 앵커. 단위까지 포함.
const formatPrice = (listing: Listing) => {
  if (listing.deal === '매매') return formatAmount(listing.price || 0);
  if (listing.deal === '전세') return formatAmount(listing.deposit);
  return `${formatAmount(listing.deposit)}/${listing.monthly || 0}`;
};

const formatDate = (iso?: string) => {
  if (!iso) return '방금';
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
};

// 핵심 특징 1개만 (텍스트 칩): 우선순위 순으로 한 개만 선택
const pickFeatureChip = (listing: Listing): string | null => {
  if ((listing as any).is_new || (listing as any).new_build) return '신축';
  if ((listing as any).full_option) return '풀옵션';
  if (listing.parking) return '주차';
  if (listing.elevator) return '엘리베이터';
  if (listing.pet) return '반려동물';
  return null;
};

export function ListingCard({ listing, compact = false, onHover, noLink = false }: ListingCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(listing.id);

  const isAd = !!(listing as any).source_site;
  // ※ 서버(API)에서 이미 저작권 정책을 적용해 자체 업로드 이미지만 내려오므로
  //   listingImages.length > 0 이면 크롤링/자체 구분 없이 썸네일 표시 OK.
  const listingImages = (listing as any).listing_images || listing.images || [];
  const thumbUrl = listingImages.length > 0 && listingImages[0]?.url ? listingImages[0].url : null;

  const price = formatPrice(listing);
  const areaM2 = listing.area_m2 || listing.area || 0;
  const floor = formatFloor(listing);
  const dong = listing.dong || '';
  const featureChip = pickFeatureChip(listing);

  // ── compact (지도 목록용) ─────────────────────────
  if (compact) {
    const Wrapper = noLink ? 'div' : Link;
    const wrapperProps = noLink ? {} : { href: `/listings/${listing.id}` };

    return (
      <Wrapper
        {...(wrapperProps as any)}
        className="group flex bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-wishes-secondary/40 transition-all h-28"
        onMouseEnter={() => onHover?.(listing.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <div className="w-28 h-28 shrink-0 relative overflow-hidden bg-gray-100">
          {thumbUrl ? (
            <img
              src={getWatermarkedUrl(thumbUrl)}
              alt={displayTitle(listing)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-wishes-primary/90 to-wishes-secondary text-white">
              <Camera className="w-5 h-5 opacity-70" strokeWidth={1.6} />
            </div>
          )}
          <span className={cn('absolute top-1.5 left-1.5 px-2 py-0.5 text-[10px] font-bold rounded text-white', dealBadgeColor(listing.deal))}>
            {listing.deal}
          </span>
        </div>

        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-base font-bold text-wishes-primary truncate leading-tight">{price}</p>
            <p className="text-xs text-gray-600 truncate mt-1">{displayTitle(listing)}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-wishes-muted">
            <span className="truncate">{dong}</span>
            {floor && <><span>·</span><span>{floor}</span></>}
          </div>
        </div>
      </Wrapper>
    );
  }

  // ── 표준 카드 (5축 고정) ─────────────────────────
  // 1) 썸네일  2) 가격(주 축)  3) 유형·면적  4) 동·층  5) 등록일 + 특징 1개
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-wishes-secondary/40 transition-all"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* 1) 썸네일 */}
      <div className="relative overflow-hidden bg-gray-100 aspect-[4/3]">
        {thumbUrl ? (
          <img
            src={getWatermarkedUrl(thumbUrl)}
            alt={displayTitle(listing)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white gap-2">
            <Camera className="w-8 h-8 opacity-80" strokeWidth={1.6} />
            <span className="text-[11px] font-semibold tracking-wide opacity-90">
              {isAd ? '사진은 문의 시 안내' : '이미지 준비 중'}
            </span>
          </div>
        )}

        {/* 좌상단 거래유형 배지 — 단 하나 */}
        <span className={cn('absolute top-2.5 left-2.5 px-2.5 py-1 text-xs font-bold rounded-md text-white shadow-sm', dealBadgeColor(listing.deal))}>
          {listing.deal}
        </span>

        {/* 우상단 찜 — 기능형 아이콘 하나 */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(listing.id); }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-all"
          aria-label={liked ? '찜 해제' : '찜하기'}
        >
          <Heart className={cn('w-4 h-4 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-gray-400')} />
        </button>
      </div>

      {/* 정보 영역 — 5축 고정 구조 */}
      <div className="p-4 space-y-2">
        {/* 2) 가격 — 주 시각 앵커 (굵고 크게, 고정 크기) */}
        <p className="text-xl md:text-2xl font-bold text-wishes-primary leading-tight">
          {price}
          {listing.deal === '월세' && <span className="text-xs font-medium text-wishes-muted ml-1">만원</span>}
        </p>

        {/* 3) 유형 · 면적 */}
        <p className="text-sm text-wishes-text">
          <span className="font-medium">{listing.type}</span>
          <span className="text-wishes-muted mx-1.5">·</span>
          <span className="text-wishes-muted">{areaM2}㎡</span>
        </p>

        {/* 4) 동 · 층 */}
        <p className="text-sm text-wishes-muted truncate">
          {dong}{floor ? ` · ${floor}` : ''}
        </p>

        {/* 5) 등록일 + 특징 칩 1개 */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-xs text-wishes-muted">{formatDate(listing.created_at)} 등록</span>
          {featureChip && (
            <span className="px-2 py-0.5 text-[11px] font-medium bg-wishes-primary/5 text-wishes-primary rounded border border-wishes-primary/10">
              {featureChip}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
