'use client';

import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, BadgeCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Listing } from '@/types';

interface ListingCardProps {
  listing: Listing;
  compact?: boolean;
  onHover?: (id: number | null) => void;
}

const sqmToPyeong = (area: number) => (area / 3.3).toFixed(1);
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
const formatPrice = (listing: Listing) => {
  if (listing.deal === '매매') return `${(listing.price / 10000).toFixed(0)}억`;
  else if (listing.deal === '전세') return `전세 ${(listing.deposit / 1000).toFixed(0)}천`;
  else return `${(listing.deposit / 1000).toFixed(0)}/${listing.monthly}`;
};

export function ListingCard({ listing, compact = false, onHover }: ListingCardProps) {
  const thumbUrl = listing.images?.[0]?.url || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop';
  const price = formatPrice(listing);

  if (compact) {
    return (
      <Link href={`/listings/${listing.id}`} className="group flex bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-wishes-secondary/30 transition-all h-28" onMouseEnter={() => onHover?.(listing.id)} onMouseLeave={() => onHover?.(null)}>
        <div className="w-28 h-28 shrink-0 relative overflow-hidden bg-gray-100">
          <img src={thumbUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
          <span className={cn('absolute top-1 left-1 px-2 py-0.5 text-xs font-bold rounded-md', getDealColor(listing.deal))}>{listing.deal}</span>
        </div>
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div className="min-w-0"><p className="text-sm font-bold text-wishes-primary truncate">{price}</p><p className="text-xs text-gray-600 truncate mt-0.5">{listing.title}</p></div>
          <div className="flex items-center gap-2 text-xs text-wishes-muted"><span>{listing.area}㎡</span><span>·</span><span>{listing.floor}</span></div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/listings/${listing.id}`} className="group card-premium block overflow-hidden" onMouseEnter={() => onHover?.(listing.id)} onMouseLeave={() => onHover?.(null)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
        <img src={thumbUrl} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out" loading="lazy" />
        <div className={cn('absolute inset-0 bg-gradient-to-t transition-opacity group-hover:opacity-60 duration-300', getDealBgGradient(listing.deal))}></div>
        <div className="absolute inset-0 flex items-start justify-between p-3">
          <span className={cn('px-3 py-1 text-xs font-bold rounded-lg shadow-lg backdrop-blur-sm', getDealColor(listing.deal))}>{listing.deal}</span>
          <div className="flex gap-2">{listing.elevator && (<span className="px-2 py-1 text-xs font-semibold bg-white/80 text-wishes-secondary rounded-lg shadow-sm">엘리베이터</span>)}</div>
        </div>
        <div className="absolute bottom-3 right-3"><span className="px-3 py-1 text-xs font-semibold bg-white/90 text-wishes-primary rounded-lg shadow-md backdrop-blur-sm">{listing.type}</span></div>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1"><div className="flex items-baseline gap-2"><p className="text-2xl font-bold text-wishes-primary">{price}</p>{listing.deal === '월세' && (<p className="text-sm text-wishes-muted">/ 월</p>)}</div></div>
        <p className="text-sm font-semibold text-wishes-text line-clamp-2 group-hover:text-wishes-secondary transition-colors">{listing.title}</p>
        <div className="flex items-center gap-4 text-xs text-wishes-muted">
          <div className="flex items-center gap-1"><Maximize className="w-4 h-4 text-wishes-secondary/60" /><span>{listing.area}㎡</span><span className="text-white/40">({sqmToPyeong(listing.area)}평)</span></div>
          <div className="flex items-center gap-1"><Building2 className="w-4 h-4 text-wishes-secondary/60" /><span>{listing.floor}</span></div>
        </div>
        <div className="flex items-center gap-1 text-xs text-wishes-muted"><MapPin className="w-4 h-4 text-wishes-secondary/60 shrink-0" /><span className="truncate">{listing.dong} · {listing.address.split(' ').slice(-1)[0]}</span></div>
        <div className="flex flex-wrap gap-2 pt-2">
          {listing.parking && (<span className="px-2.5 py-1 text-xs font-medium bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20">🚗 주차</span>)}
          {listing.elevator && (<span className="px-2.5 py-1 text-xs font-medium bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20">🚡 엘리베이터</span>)}
          {listing.pet && (<span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">🐾 반려동물</span>)}
        </div>
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-wishes-secondary/60" /><span className="text-wishes-muted">신뢰거래</span></div>
          <span className="text-wishes-muted flex items-center gap-1"><Calendar className="w-3 h-3" />방금 전</span>
        </div>
      </div>
    </Link>
  );
}
