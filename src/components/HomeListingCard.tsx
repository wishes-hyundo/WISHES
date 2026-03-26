'use client';

import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, BadgeCheck, Eye, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HomeListingCardProps {
  listing: any;
}

const getDealColor = (deal: string) => {
  switch (deal) {
    case 'ì ì¸': return 'bg-wishes-secondary text-white';
    case 'ìì¸': return 'bg-emerald-500 text-white';
    case 'ë§¤ë§¤': return 'bg-wishes-accent text-white';
    default: return 'bg-gray-400 text-white';
  }
};

const getDealBgGradient = (deal: string) => {
  switch (deal) {
    case 'ì ì¸': return 'from-wishes-secondary/20 to-wishes-secondary/0';
    case 'ìì¸': return 'from-emerald-500/20 to-emerald-500/0';
    case 'ë§¤ë§¤': return 'from-wishes-accent/20 to-wishes-accent/0';
    default: return 'from-gray-400/20 to-gray-400/0';
  }
};

const formatPrice = (listing: any) => {
  const deposit = listing.deposit || 0;
  const monthly = listing.monthly || 0;
  const price = listing.price || 0;

  if (listing.deal === 'ë§¤ë§¤') {
    if (price >= 10000) {
      const uk = Math.floor(price / 10000);
      const man = price % 10000;
      return man > 0 ? `${uk}ìµ ${man.toLocaleString('ko-KR')}` : `${uk}ìµ`;
    }
    return `${price.toLocaleString('ko-KR')}`;
  } else if (listing.deal === 'ì ì¸') {
    if (deposit >= 10000) {
      const uk = Math.floor(deposit / 10000);
      const man = deposit % 10000;
      return `ì ì¸ ${man > 0 ? `${uk}ìµ ${man.toLocaleString('ko-KR')}` : `${uk}ìµ`}`;
    }
    return `ì ì¸ ${deposit.toLocaleString('ko-KR')}`;
  } else {
    return `${deposit.toLocaleString('ko-KR')}/${monthly}`;
  }
};

const sqmToPyeong = (area: number | null | undefined) => {
  if (!area || area === 0) return null;
  return (area / 3.3).toFixed(1);
};

export function HomeListingCard({ listing }: HomeListingCardProps) {
  // Supabaseìì ê°ì ¸ì¨ ì´ë¯¸ì§ (listing_images ì¡°ì¸)
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
      {/* ì´ë¯¸ì§ ìì­ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-wishes-light/60 to-wishes-accent/20 aspect-[16/10]">
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
        {/* ì´ë¯¸ì§ ìì ë / ìë¬ ì íë ì´ì¤íë */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200',
          thumbUrl ? 'hidden' : ''
        )}>
          <Building2 className="w-10 h-10 text-wishes-green/30" />
        </div>

        {/* ê·¸ëëì¸í¸ ì¤ë²ë ì´ */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t transition-opacity group-hover:opacity-60 duration-300',
          getDealBgGradient(listing.deal)
        )}></div>

        {/* ë°°ì§ë¤ */}
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
                ìë¦¬ë² ì´í°
              </span>
            )}
          </div>
        </div>

        {/* ì°ì¸¡ íë¨ íì ë°°ì§ */}
        <div className="absolute bottom-3 right-3">
          <span className="px-3 py-1 text-xs font-semibold bg-white/90 text-wishes-primary rounded-lg shadow-md backdrop-blur-sm">
            {listing.type}
          </span>
        </div>
      </div>

      {/* ì ë³´ ìì­ */}
      <div className="p-4 space-y-4">
        {/* ê°ê²© */}
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <p className="text-xs text-gray-400 mb-0.5">{listing.deal}</p>
              <p className="text-2xl font-bold text-wishes-primary">{price}</p>
            {listing.deal === 'ìì¸' && (
              <p className="text-sm text-wishes-muted">/ ì</p>
            )}
          </div>
        </div>

        {/* ì ëª© */}
        <p className="text-sm font-semibold text-wishes-text line-clamp-2 group-hover:text-wishes-secondary transition-colors">
          {listing.title}
        </p>

        {/* ê¸°ë³¸ ì ë³´ */}
        <div className="flex items-center gap-4 text-xs text-wishes-muted">
          {area > 0 && (
            <div className="flex items-center gap-1">
              <Maximize className="w-4 h-4 text-wishes-secondary/60" />
              <span>{area}ã¡</span>
              {pyeong && <span className="text-gray-400">({pyeong}í)</span>}
            </div>
          )}
          {floor && (
            <div className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-wishes-secondary/60" />
              <span>{floor}</span>
            </div>
          )}
        </div>

        {/* ìì¹ */}
        <div className="flex items-center gap-1 text-xs text-wishes-muted">
          <MapPin className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
          <span className="truncate">{listing.dong} Â· {listing.address?.split(' ').slice(-1)[0] || ''}</span>
        </div>

        {/* ìµì íê·¸ */}
        <div className="flex flex-wrap gap-2 pt-2">
          {listing.parking && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20">
              ð ì£¼ì°¨
            </span>
          )}
          {listing.elevator && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20">
              ð¡ ìë¦¬ë² ì´í°
            </span>
          )}
          {listing.pet && (
            <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
              ð¾ ë°ë ¤ëë¬¼
            </span>
          )}
        </div>

        {/* íë¨ ì ë³´ */}
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
            {listing.created_at ? new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' }) : 'ë°©ê¸ ì '}
          </span>
        </div>
      </div>
    </Link>
  );
}
