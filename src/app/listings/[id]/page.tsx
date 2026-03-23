import { db } from '@/db';
import { listings, listingImages, listingFeatures } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, Phone, ArrowLeft, Check, X } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor } from '@/lib/utils';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await db.select().from(listings).where(eq(listings.id, parseInt(id))).limit(1);
  if (!listing[0]) return { title: 'ë§¤ë¬¼ ìì' };
  const l = listing[0];
  return {
    title: `${l.title} | ${l.deal} ${l.type}`,
    description: `${l.dong} ${l.type} ${l.deal} - ${l.address}`,
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  const listingId = parseInt(id);

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!listing) notFound();

  const images = await db.select().from(listingImages).where(eq(listingImages.listingId, listingId)).orderBy(listingImages.order);
  const features = await db.select().from(listingFeatures).where(eq(listingFeatures.listingId, listingId));

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* ìë¨ ë¤ë¹ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary">
            <ArrowLeft className="w-4 h-4" />
            ë§¤ë¬¼ ëª©ë¡
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium truncate">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ì¢ì¸¡: ì´ë¯¸ì§ + ìì¸ */}
          <div className="lg:col-span-2 space-y-6">
            {/* ì´ë¯¸ì§ ê°¤ë¬ë¦¬ */}
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
              <div className="aspect-[16/10] bg-gray-100 relative">
                {images.length > 0 ? (
                  <img
                    src={images[0].url}
                    alt={images[0].alt || listing.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <Building2 className="w-16 h-16" />
                  </div>
                )}
                <span className={`absolute top-4 left-4 px-3 py-1 text-sm font-bold rounded-lg ${getDealColor(listing.deal)}`}>
                  {listing.deal}
                </span>
                <span className={`absolute top-4 right-4 px-3 py-1 text-sm font-medium rounded-lg ${getStatusColor(listing.status)}`}>
                  {listing.status}
                </span>
              </div>
              {images.length > 1 && (
                <div className="flex gap-1 p-2 overflow-x-auto">
                  {images.map((img) => (
                    <img
                      key={img.id}
                      src={img.url}
                      alt={img.alt || ''}
                      className="w-20 h-16 object-cover rounded-lg border-2 border-transparent hover:border-wishes-secondary cursor-pointer"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ìì¸ ì ë³´ */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <InfoRow label="ë§¤ë¬¼ì í" value={listing.type} />
                <InfoRow label="ê±°ëì í" value={listing.deal} />
                <InfoRow label="ì ì©ë©´ì " value={`${listing.area}ã¡ (${sqmToPyeong(listing.area)}í)`} />
                <InfoRow label="ì¸µì" value={listing.floor} />
                <InfoRow label="ì£¼ì" value={listing.address} fullWidth />
                <InfoRow label="ë" value={listing.dong} />
                {listing.built && <InfoRow label="ì¤ê³µëë" value={listing.built} />}
                {listing.availableDate && <InfoRow label="ìì£¼ê°ë¥ì¼" value={listing.availableDate} />}
              </div>

              {/* ìµì */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">ìµì / ìì¤</h3>
                <div className="flex flex-wrap gap-2">
                  <OptionBadge label="ì£¼ì°¨" available={listing.parking ?? false} />
                  <OptionBadge label="ìë¦¬ë² ì´í°" available={listing.elevator ?? false} />
                  <OptionBadge label="ë°ë ¤ëë¬¼" available={listing.pet ?? false} />
                  {features.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">
                      {f.feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* ì¤ëª */}
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">ìì¸ ì¤ëª</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ì°ì¸¡: ìë´ CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">ì´ ë§¤ë¬¼ ë¬¸ìíê¸°</h3>

              <a
                href="tel:1533-9580"
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                <Phone className="w-5 h-5" />
                ì í ìë´ 1533-9580
              </a>

              <a
                href={`https://pf.kakao.com/_xnxaxjxj`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-yellow-400 text-yellow-900 py-3 rounded-xl font-bold mt-3 hover:bg-yellow-300 transition-colors"
              >
                ì¹´ì¹´ì¤í¡ ìë´
              </a>

              <Link
                href={`/contact?listing=${listing.id}`}
                className="flex items-center justify-center gap-2 w-full border-2 border-wishes-primary text-wishes-primary py-3 rounded-xl font-bold mt-3 hover:bg-blue-50 transition-colors"
              >
                ì¨ë¼ì¸ ìë´ ì ì²­
              </Link>

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  ë±ë¡ì¼: {new Date(listing.createdAt).toLocaleDateString('ko-KR')}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  ìì ì¼: {new Date(listing.updatedAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function OptionBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <span className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full ${
      available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400 line-through'
    }`}>
      {available ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}
