import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar } from 'lucide-react';
import { cn, getFormattedPrice, getDealColor, sqmToPyeong, timeAgo } from '@/lib/utils';
import type { Listing } from '@/types';

interface ListingCardProps {
  listing: Listing;
  compact?: boolean;
  onHover?: (id: number | null) => void;
}

export function ListingCard({ listing, compact = false, onHover }: ListingCardProps) {
  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);
  const thumbUrl = listing.images?.[0]?.url || '/images/placeholder.svg';

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cn(
        'group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-wishes-secondary/30 transition-all',
        compact ? 'flex' : ''
      )}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* 이미지 */}
      <div className={cn(
        'relative overflow-hidden bg-gray-100',
        compact ? 'w-32 h-28 shrink-0' : 'aspect-[4/3]'
      )}>
        <img
          src={thumbUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* 거래 유형 배지 */}
        <span className={cn(
          'absolute top-2 left-2 px-2 py-0.5 text-xs font-bold rounded-md',
          getDealColor(listing.deal)
        )}>
          {listing.deal}
        </span>
        {/* 매물 유형 */}
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-black/50 text-white rounded-md">
          {listing.type}
        </span>
      </div>

      {/* 정보 */}
      <div className={cn('p-3', compact ? 'flex-1 min-w-0' : '')}>
        {/* 가격 */}
        <p className="text-lg font-bold text-wishes-primary truncate">
          {price.main}
        </p>

        {/* 제목 */}
        <p className="text-sm text-gray-700 truncate mt-0.5">{listing.title}</p>

        {/* 상세 정보 */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Maximize className="w-3 h-3" />
            {listing.area}㎡ ({sqmToPyeong(listing.area)}평)
          </span>
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {listing.floor}
          </span>
        </div>

        {/* 위치 */}
        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{listing.dong} · {listing.address.split(' ').slice(-1)[0]}</span>
        </div>

        {!compact && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            {/* 옵션 태그 */}
            <div className="flex gap-1">
              {listing.parking && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">주차</span>}
              {listing.elevator && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">엘리베이터</span>}
              {listing.pet && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">반려동물</span>}
            </div>
            {/* 등록일 */}
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="w-3 h-3" />
              {timeAgo(listing.createdAt)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
