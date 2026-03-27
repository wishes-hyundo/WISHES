import { createClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, ArrowLeft, Check, X } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor } from '@/lib/utils';
import ShareButton from '@/components/ShareButton';
import RecentlyViewedTracker from '@/components/RecentlyViewedTracker';
import type { Metadata } from 'next';
import Image from 'next/image';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', parseInt(id))
    .single();

  if (!listing) return { title: '매물 없음' };

  // Get first image for OG
  const { data: images } = await supabase
    .from('listing_images')
    .select('url')
    .eq('listing_id', parseInt(id))
    .order('sort_order')
    .limit(1);

  const ogImage = images?.[0]?.url || '/og-image.png';
  const ogTitle = `${listing.title} | ${listing.deal} ${listing.type}`;
  const ogDesc = `${listing.dong} ${listing.type} ${listing.deal} - ${listing.address}`;

  return {
    title: ogTitle,
    description: ogDesc,
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      url: `https://wishes.co.kr/listings/${id}`,
      siteName: '위시스부동산',
      images: [{
        url: ogImage,
        width: 1200,
        height: 630,
        alt: listing.title,
      }],
      locale: 'ko_KR',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDesc,
      images: [ogImage],
    },
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  const listingId = parseInt(id);
  const supabase = createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();

  if (!listing) notFound();

  const { data: images } = await supabase
    .from('listing_images')
    .select('*')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });

  const { data: features } = await supabase
    .from('listing_features')
    .select('*')
    .eq('listing_id', listingId);

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);
  const imageList = images || [];
  const featureList = features || [];

  // Schema.org JSON-LD 구조화 데이터
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: listing.description || `${listing.dong} ${listing.type} ${listing.deal}`,
    url: `https://wishes.co.kr/listings/${listing.id}`,
    datePosted: listing.created_at,
    ...(imageList.length > 0 && { image: imageList.map((img: any) => img.url) }),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KRW',
      price: listing.deal === '매매' ? (listing.price || 0) * 10000 : (listing.deposit || 0) * 10000,
      availability: listing.status === '가용' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      ...(listing.deal === '월세' && {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: (listing.monthly || 0) * 10000,
          priceCurrency: 'KRW',
          unitText: '월',
          referenceQuantity: {
            '@type': 'QuantitativeValue',
            value: 1,
            unitCode: 'MON',
          },
        },
      }),
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.address || '',
      addressLocality: listing.dong || '',
      addressRegion: '서울특별시',
      addressCountry: 'KR',
    },
    ...(listing.area_m2 && {
      floorSize: {
        '@type': 'QuantitativeValue',
        value: listing.area_m2,
        unitCode: 'MTK',
        unitText: '㎡',
      },
    }),
    ...(listing.floor_current && {
      numberOfRooms: listing.floor_current,
    }),
    additionalProperty: [
      { '@type': 'PropertyValue', name: '거래유형', value: listing.deal },
      { '@type': 'PropertyValue', name: '매물유형', value: listing.type },
      ...(listing.parking ? [{ '@type': 'PropertyValue', name: '주차', value: '가능' }] : []),
      ...(listing.elevator ? [{ '@type': 'PropertyValue', name: '엘리베이터', value: '있음' }] : []),
      ...(listing.pet ? [{ '@type': 'PropertyValue', name: '반려동물', value: '가능' }] : []),
      ...(listing.built_year ? [{ '@type': 'PropertyValue', name: '준공년도', value: listing.built_year }] : []),
    ],
    broker: {
      '@type': 'RealEstateAgent',
      name: '위시스부동산중개법인',
      url: 'https://wishes.co.kr',    },
  };

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <RecentlyViewedTracker listingId={id} />

      {/* Schema.org 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 상단 네비 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary">
            <ArrowLeft className="w-4 h-4" />
            매물 목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium truncate">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 좌측: 이미지 + 상세 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 이미지 갤러리 */}
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
              <div className="aspect-[16/10] bg-gray-100 relative">
                {imageList.length > 0 && imageList[0].url ? (
                  <Image
                    src={imageList[0].url}
                    alt={imageList[0].alt || listing.title}
                    className="w-full h-full object-cover"
                  
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
              />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-100 to-gray-200">
                    <Building2 className="w-16 h-16 mb-2" />
                    <p className="text-sm">이미지 준비 중</p>
                  </div>
                )}
                <span className={`absolute top-4 left-4 px-3 py-1 text-sm font-bold rounded-lg ${getDealColor(listing.deal)}`}>
                  {listing.deal}
                </span>
                <span className={`absolute top-4 right-4 px-3 py-1 text-sm font-medium rounded-lg ${getStatusColor(listing.status)}`}>
                  {listing.status}
                </span>
              </div>
              {imageList.length > 1 && (
                <div className="flex gap-1 p-2 overflow-x-auto">
                  {imageList.map((img) => (
                    <Image
                      key={img.id}
                      src={img.url}
                      alt={img.alt || ''}
                      className="w-20 h-16 object-cover rounded-lg border-2 border-transparent hover:border-wishes-secondary cursor-pointer"
                width={80}
                height={64}
              />
                  ))}
                </div>
              )}
            </div>

            {/* 상세 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <InfoRow label="매물유형" value={listing.type} />
                <InfoRow label="거래유형" value={listing.deal} />
                <InfoRow label="전용면적" value={listing.area_m2 ? `${listing.area_m2}㎡ (${sqmToPyeong(listing.area_m2)}평)` : '정보 없음'} />
                <InfoRow label="층수" value={listing.floor_current} />
                <InfoRow label="주소" value={listing.address} fullWidth />
                <InfoRow label="동" value={listing.dong} />
                {listing.built_year && <InfoRow label="준공년도" value={listing.built_year} />}
                {listing.available_date && <InfoRow label="입주가능일" value={listing.available_date} />}
              </div>

              {/* 옵션 */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h3>
                <div className="flex flex-wrap gap-2">
                  <OptionBadge label="주차" available={listing.parking ?? false} />
                  <OptionBadge label="엘리베이터" available={listing.elevator ?? false} />
                  <OptionBadge label="반려동물" available={listing.pet ?? false} />
                  <OptionBadge label="발코니" available={listing.balcony ?? false} />
                  <OptionBadge label="풀옵션" available={listing.full_option ?? false} />
                  {featureList.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">
                      {f.feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* 설명 */}
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">상세 설명</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 우측: 상담 CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>

              <Link
                href={`/contact?listing=${listing.id}`}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                상담신청
              </Link>

              <ShareButton
                url={`https://wishes.co.kr/listings/${listing.id}`}
                title={listing.title || '위시스부동산 매물'}
                description={`${listing.deal || ''} ${listing.type || ''} - ${listing.dong || ''}`}
              />

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR')}
                </p>
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR')}
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
