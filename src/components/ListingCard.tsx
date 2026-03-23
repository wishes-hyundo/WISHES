import Link from 'next/link';
import { Listing, formatPrice } from '@/data/listings';

export default function ListingCard({ listing }: { listing: Listing }) {
  const dealColors = {
    '전세': 'bg-blue-500',
    '월세': 'bg-emerald-500',
    '매매': 'bg-orange-500',
  };

  return (
    <Link href={`/listings/${listing.id}`} className="block card-hover">
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
        {/* Image */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-navy-100 to-navy-200 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center text-navy-300">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </div>
          {/* Status Badge */}
          {listing.status === '계약중' && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-red-500 text-white px-4 py-1.5 rounded-full text-sm font-bold">계약중</span>
            </div>
          )}
          {/* Deal Type Badge */}
          <span className={`absolute top-3 left-3 ${dealColors[listing.deal]} text-white text-xs font-bold px-3 py-1 rounded-full`}>
            {listing.deal}
          </span>
          {/* Type Badge */}
          <span className="absolute top-3 right-3 bg-white/90 backdrop-blur text-navy-800 text-xs font-medium px-2.5 py-1 rounded-full">
            {listing.type}
          </span>
        </div>

        {/* Info */}
        <div className="p-4 sm:p-5">
          {/* Price */}
          <p className="text-lg sm:text-xl font-bold text-navy-800 mb-1">
            {formatPrice(listing)}
          </p>

          {/* Title */}
          <h3 className="text-sm font-medium text-gray-700 mb-2 line-clamp-1">
            {listing.title}
          </h3>

          {/* Details */}
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
            <span>{listing.area}㎡</span>
            <span className="w-px h-3 bg-gray-200" />
            <span>{listing.floor}</span>
            <span className="w-px h-3 bg-gray-200" />
            <span>{listing.dong}</span>
          </div>

          {/* Features */}
          <div className="flex flex-wrap gap-1.5">
            {listing.features.slice(0, 4).map((f) => (
              <span key={f} className="bg-gray-50 text-gray-500 text-[11px] px-2 py-0.5 rounded-md">
                {f}
              </span>
            ))}
            {listing.features.length > 4 && (
              <span className="text-gray-400 text-[11px] px-1">+{listing.features.length - 4}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
