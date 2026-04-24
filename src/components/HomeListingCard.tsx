'use client';

import Link from 'next/link';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFloor } from '@/lib/formatFloor';
import { displayTitle } from '@/lib/formatListingTitle';
import { getWatermarkedUrl } from '@/lib/imageUrl';

interface HomeListingCardProps {
  listing: any;
}

// 거래유형 → 좌상단 단색 배지 (ListingCard와 통일)
const dealBadgeColor = (deal: string) => {
  switch (deal) {
    case '매매': return 'bg-wishes-primary';
    case '전세': return 'bg-wishes-secondary';
    case '월세': return 'bg-emerald-500';
    case '단기': return 'bg-amber-500';
    default:    return 'bg-gray-500';
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

const formatPrice = (listing: any) => {
  if (listing.deal === '매매') return formatAmount(listing.price || 0);
  if (listing.deal === '전세') return formatAmount(listing.deposit || 0);
  return `${formatAmount(listing.deposit || 0)}/${listing.monthly || 0}`;
};

const formatDate = (iso?: string) => {
  if (!iso) return '방금';
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
};

const pickFeatureChip = (listing: any): string | null => {
  if (listing.is_new || listing.new_build) return '신축';
  if (listing.full_option) return '풀옵션';
  if (listing.parking) return '주차';
  if (listing.elevator) return '엘리베이터';
  if (listing.pet) return '반려동물';
  return null;
};

export function HomeListingCard({ listing }: HomeListingCardProps) {
  const isAd = !!listing.source_site;
  // ※ 서버(API)에서 이미 저작권 정책(자체 업로드만 통과)을 적용하므로
  //   크롤링/자체 구분 없이 넘어온 이미지를 그대로 사용 가능.
  //   (레거시 마스크 경로 9xxxxx/ 패턴은 기존대로 유지)
  const images = (listing.listing_images || []).filter((img: any) => {
    const u = img?.url || '';
    return u && !u.match(/\/listings\/9\d{5}\//);
  });
  const rawThumb = images.length > 0 ? images[0].url : null;
  const thumbUrl = rawThumb ? getWatermarkedUrl(rawThumb) : null;

  const price = formatPrice(listing);
  const area = listing.area_m2 || listing.area || 0;
  const floor = formatFloor(listing);
  const dong = listing.dong || '';
  const featureChip = pickFeatureChip(listing);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-wishes-secondary/40 transition-all"
    >
      {/* 1) 썸네일 */}
      <div className="relative overflow-hidden bg-gray-100 aspect-[4/3]">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={displayTitle(listing)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white gap-2">
            <Camera className="w-7 h-7 opacity-80" strokeWidth={1.6} />
            <span className="text-[11px] font-semibold tracking-wide opacity-90">
              {isAd ? '사진은 문의 시 안내' : '이미지 준비 중'}
            </span>
          </div>
        )}

        {/* 좌상단 단일 거래유형 배지 */}
        <span className={cn(
          'absolute top-2.5 left-2.5 px-2.5 py-1 text-xs font-bold rounded-md text-white shadow-sm',
          dealBadgeColor(listing.deal)
        )}>
          {listing.deal}
        </span>
      </div>

      {/* 정보 영역 — 5축 고정 */}
      <div className="p-4 space-y-2">
        {/* 2) 가격 (주 시각 앵커) */}
        <p className="text-xl md:text-2xl font-bold text-wishes-primary leading-tight">
          {price}
          {listing.deal === '월세' && <span className="text-xs font-medium text-wishes-muted ml-1">만원</span>}
        </p>

        {/* 3) 유형 · 면적 */}
        <p className="text-sm text-wishes-text">
          <span className="font-medium">{listing.type}</span>
          <span className="text-wishes-muted mx-1.5">·</span>
          <span className="text-wishes-muted">{area}㎡</span>
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
