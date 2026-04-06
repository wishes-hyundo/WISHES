'use client';

import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, Eye, Hash, Flame, Sparkles, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/contexts/FavoritesContext';
import type { Listing } from '@/types';

// NEW: 7ì¼ ì´ë´ ë±ë¡ / HOT: ì¡°íì 50 ì´ì
const isNew = (createdAt: string) => {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 3 * 24 * 60 * 60 * 1000;
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
    case 'ì ì¸':
      return 'bg-wishes-secondary text-white';
    case 'ìì¸':
      return 'bg-emerald-500 text-white';
    case 'ë§¤ë§¤':
      return 'bg-wishes-accent text-white';
    default:
      return 'bg-gray-400 text-white';
  }
};

const getDealBgGradient = (deal: string) => {
  switch (deal) {
    case 'ì ì¸':
      return 'from-wishes-secondary/20 to-wishes-secondary/0';
    case 'ìì¸':
      return 'from-emerald-500/20 to-emerald-500/0';
    case 'ë§¤ë§¤':
      return 'from-wishes-accent/20 to-wishes-accent/0';
    default:
      return 'from-gray-400/20 to-gray-400/0';
  }
};

const formatAmount = (amount: number) => {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}ìµ ${man.toLocaleString('ko-KR')}` : `${uk}ìµ`;
  }
  return `${amount.toLocaleString('ko-KR')}`;
};

const formatFloor = (listing: Listing) => {
  const current = listing.floor_current || listing.floor || '';
  const total = listing.floor_total;
  if (!current) return '';
  if (total) return `${current}/${total}ì¸µ`;
  return current.includes('ì¸µ') ? current : `${current}ì¸µ`;
};

const formatPrice = (listing: Listing) => {
  if (listing.deal === 'ë§¤ë§¤') {
    return formatAmount(listing.price || 0);
  } else if (listing.deal === 'ì ì¸') {
    return `ì ì¸ ${formatAmount(listing.deposit)}`;
  } else {
    return `${formatAmount(listing.deposit)}/${listing.monthly || 0}`;
  }
};

const getPriceLabel = (listing: Listing) => {
  if (listing.deal === 'ë§¤ë§¤') return 'ë§¤ë§¤ê°';
  if (listing.deal === 'ì ì¸') return 'ì ì¸ê¸';
  return 'ë³´ì¦ê¸/ìì¸';
};

export function ListingCard({ listing, compact = false, onHover, noLink = false }: ListingCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(listing.id);
  // Supabase ì¡°ì¸ ê²°ê³¼(listing_images) ëë ê¸°ì¡´ images íëìì ì´ë¯¸ì§ ì¶ì¶
  const listingImages = (listing as any).listing_images || listing.images || [];
  const thumbUrl = listingImages.length > 0 && listingImages[0].url ? listingImages[0].url : null;
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
        {/* ì´ë¯¸ì§ */}
        <div className="w-28 h-28 shrink-0 relative overflow-hidden bg-gray-100">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
          )}
          <span className={cn(
            'absolute top-1 left-1 px-2 py-0.5 text-xs font-bold rounded-md',
            getDealColor(listing.deal)
          )}>
            {listing.deal}
          </span>
        </div>

        {/* ì ë³´ */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-wishes-primary truncate">{price}</p>
              <span className="text-[10px] text-wishes-secondary/70 font-mono font-medium shrink-0 bg-wishes-secondary/10 px-1.5 py-0.5 rounded">W-{listing.id}</span>
            </div>
            <p className="text-xs text-gray-600 truncate mt-0.5">{listing.title}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-wishes-muted">
            <span>{listing.area_m2 || listing.area || 0}ã¡</span>
            <span>Â·</span>
            <span>{formatFloor(listing)}</span>
            {(listing as any).views > 0 && (
              <>
                <span>Â·</span>
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
      {/* ì´ë¯¸ì§ ìì­ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
        {/* ë°°ê²½ ì´ë¯¸ì§ */}
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <Building2 className="w-12 h-12 text-gray-400" />
          </div>
        )}

        {/* ê·¸ëëì¸í¸ ì¤ë²ë ì´ */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t transition-opacity group-hover:opacity-60 duration-300',
          getDealBgGradient(listing.deal)
        )}></div>

        {/* ì¢ì¸¡ ë°°ì§ë¤ (ì°ì¸¡ì ListingCardActions ìì­) */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {/* ê±°ë ì í ë°°ì§ */}
          <span className={cn(
            'px-3 py-1 text-xs font-bold rounded-lg shadow-lg backdrop-blur-sm w-fit',
            getDealColor(listing.deal)
          )}>
            {listing.deal}
          </span>

          {/* NEW ë°°ì§ */}
          {isNew(listing.created_at) && (
            <span className="flex items-center gap-0.5 px-2 py-1 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-lg shadow-sm w-fit">
              <Sparkles className="w-3 h-3" /> NEW
            </span>
          )}

          {/* HOT ë°°ì§ */}
          {isHot((listing as any).views) && (
            <span className="flex items-center gap-0.5 px-2 py-1 text-xs font-bold bg-red-500 text-white rounded-lg shadow-sm w-fit">
              <Flame className="w-3 h-3" /> HOT
            </span>
          )}
        </div>

        {/* ì°ì¸¡ ìë¨ ì° ë²í¼ (S3) */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(listing.id); }}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-all z-10"
          aria-label={liked ? 'ì° í´ì ' : 'ì°íê¸°'}
        >
          <Heart className={cn('w-4.5 h-4.5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-gray-400')} />
        </button>

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
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-wishes-muted/80 uppercase tracking-wider">{getPriceLabel(listing)}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-wishes-primary">{price}</p>
            {listing.deal === 'ìì¸' && (
              <p className="text-sm text-wishes-muted">ë§ì</p>
            )}
          </div>
        </div>

        {/* ì ëª© */}
        <p className="text-sm font-semibold text-wishes-text line-clamp-2 group-hover:text-wishes-secondary transition-colors">
          {listing.title}
        </p>

        {/* ê¸°ë³¸ ì ë³´ */}
        <div className="flex items-center gap-4 text-xs text-wishes-muted">
          {(listing.area_m2 || listing.area) ? (
            <div className="flex items-center gap-1">
              <Maximize className="w-4 h-4 text-wishes-secondary/60" />
              <span>{listing.area_m2 || listing.area}ã¡</span>
              <span className="text-gray-400">({sqmToPyeong(listing.area_m2 || listing.area)}í)</span>
            </div>
          ) : null}
          {(listing.floor_current || listing.floor) && (
            <div className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-wishes-secondary/60" />
              <span>{formatFloor(listing)}</span>
            </div>
          )}
        </div>

        {/* ìì¹ */}
        <div className="flex items-center gap-1 text-xs text-wishes-muted">
          <MapPin className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
          <span className="truncate">{listing.dong} Â· {listing.address.split(' ').slice(-1)[0]}</span>
        </div>

        {/* ìµì íê·¸ */}
        <div className="flex flex-wrap gap-2 pt-2">
          {listing.parking && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20 hover:bg-wishes-secondary/20 transition-colors">
              ð ì£¼ì°¨
            </span>
          )}
          {listing.elevator && (
            <span className="px-2.5 py-1 text-xs font-medium bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20 hover:bg-wishes-accent/20 transition-colors">
              ð¡ ìë¦¬ë² ì´í°
            </span>
          )}
          {listing.pet && (
            <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
              ð¾ ë°ë ¤ëë¬¼
            </span>
          )}
        </div>

        {/* íë¨ ì ë³´ */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-wishes-secondary/80 font-mono font-medium flex items-center gap-1 bg-wishes-secondary/10 px-1.5 py-0.5 rounded">
              <Hash className="w-3 h-3" />
              W-{listing.id}
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
            {listing.created_at ? new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' }) : 'ë°©ê¸ ì '}
          </span>
        </div>
      </div>
    </Link>
  );
}
