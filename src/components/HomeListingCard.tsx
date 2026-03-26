'use client';

import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, BadgeCheck, Eye, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HomeListingCardProps {
  listing: any;
}

const getDealColor = (deal: string) => {
  switch (deal) {
    case '전세': return 'bg-wishes-secondary text-white';
    case '월세': return 'bg-emerald-500 text-white';
    case '매매': return 'bg-wishes-accent text-white';
    default: return 'bg-gray-400 text-white';
  }
};

const getDealBgGradient = (deal: string) => {
  switch (deal) {
    case '전세': return 'from-wishes-secondary/20 to-wishes-secondary/0';
    case '월세': return 'from-emerald-500/20 to-emerald-500/0';
    case '매매': return 'from-wishes-accent/20 to-wishes-accent/0';
    default: return 'from-gray-400/20 to-gray-400/0';
  }
};

const formatPrice = (listing: any) => {
  const deposit = listing.deposit || 0;
  const monthly = listing.monthly || 0;
  const price = listing.price || 0;

  if (listing.deal === '매매') {
    if (price >= 10000) {
      const uk = Math.floor(price / 10000);
      const man = price % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}` : `${uk}억`;
    }
    return `${price.toLocaleString()}`;
  } else if (listing.deal === '전세') {
    if (deposit >= 10000) {
      const uk = Math.floor(deposit / 10000);
      const man = deposit % 10000;
      return `전세 ${man > 0 ? `${uk}억 ${man.toLocaleString()}` : `${uk}억`}`;
    }
    return `전세 ${deposit.toLocaleString()}`;
  } else {
    return `${deposit.toLocaleString()}/${monthly}`;
  }
};

const sqmToPyeong = (area: number | null | undefined) => {
  if (!area || area === 0) return null;
  return (area / 3.3).toFixed(1);
};

export function HomeListingCard({ listing }: HomeListingCardProps) {
  // Supabase에서 가져온 이미지 (listing_images 조인)
  const images = listing.listing_images || [];
  const thumbUrl = images.length > 0 ? images[0].url : null;
  const price = formatPrice(listing);
  const area = listing.area_m2 || listing.area || 0;
  const floor = listing.floor_current || listing.floor || '';
  const pyeong = sqmToPyeong(area);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group card-premium block overflow-hidden"
    >
      {/* 이미지 영역 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        {/* 이미지 없을 때 / 에러 시 플레이스홀더 */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200',
          thumbUrl ? 'hidden' : ''
        )}>
          <Building2 className="w-12 h-12 text-gray-400" />
        </div>

        {/* 그래디언트 오버레이 */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t transition-opacity group-hover:opacity-60 duration-300',
          getDealBgGradient(listing.deal)
        )}></div>

        {/* 배지들 */}
        <div className="absolute inset-0 flex items-start justify-between p-3">
          <span className={cn(
            'px-3 py-1 text-xs font-bold rounded-full shadow-lg backdrop-blur-sm',
            getDealColor(listing.deal)
          )}>
            {listing.deal}
          </span>

          <div className="flex gap-2">
            {listing.elevator && (
              <span className="px-2 py-1 text-xs font-semibold bg-white/80 text-wishes-secondary rounded-lg shadow-sm">
                엘리베이터
              </span>
            )}
          </div>
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
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-wishes-primary">{price}</p>
            {listing.deal === '월세' && (
              <p className="text-sm text-wishes-muted">/ 월</p>
            )}
          </div>
        </div>

        {/* 제목 */}
        <p className="text-sm font-semibold text-wishes-text line-clamp-2 group-hover:text-wishes-secondary transition-colors">
          {listing.title}
        </p>

        {/* 기본 정보 */}
        <div className="flex items-center gap-4 text-xs text-wishes-muted">
          {area > 0 && (
            <div className="flex items-center gap-1">
              <Maximize className="w-4 h-4 text-wishes-secondary/60" />
              <span>{area}㎡</span>
              {pyeong && <span className="text-gray-400">({pyeong}평)</span>}
            </div>
          )}
          {floor && (
            <div className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-wishes-secondary/60" />
              <span>{floor}</span>
            </div>
          )}
        </div>

        {/* 위치 */}
        <div className="flex items-center gap-1 text-xs text-wishes-muted">
          <MapPin className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
          <span className="truncate">{listing.dong} · {listing.address?.split(' ').slice(-1)[0] || ''}</span>
        </div>

        {/* 옵션 태그 */}
        <div className="flex flex-wrap gap-2 pt-2">
          {listing.parking && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20">
              🚗 주차
            </span>
          )}
          {listing.elevator && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20">
              🚡 엘리베이터
            </span>
          )}
          {listing.pet && (
            <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
              🐾 반려동물
            </span>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-wishes-muted font-mono flex items-center gap-1">
              <Hash className="w-3 h-3" />
              W-{listing.id}
            </span>
            {listing.views > 0 && (
              <span className="text-wishes-muted flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {listing.views}
              </span>
            )}
          </div>
          <span className="text-wishes-muted flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {listing.created_at ? new Date(listing.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '방금 전'}
          </span>
        </div>
      </div>
    </Link>
  );
}
