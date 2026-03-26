import { createClient, createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Maximize, Building2, Calendar, ArrowLeft, Check, X, Eye, Hash } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor } from '@/lib/utils';
import ImageGallery from '@/components/ImageGallery';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('title, deal, type, dong, address')
    .eq('id', parseInt(id))
    .single();

  if (!listing) return { title: '매물 없음' };

  return {
    title: `${listing.title} | ${listing.deal} ${listing.type}`,
    description: `${listing.dong} ${listing.type} ${listing.deal} - ${listing.address}`,
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

  // 조회수 증가 (서버 클라이언트 사용 - RLS 우회)
  try {
    const serverSupabase = createServerClient();
    serverSupabase
      .from('listings')
      .update({ views: (listing.views || 0) + 1 })
      .eq('id', listingId)
      .then(() => {})
      .catch(() => {});
  } catch (e) {
    // service role key 없을 때 무시
  }
    .catch(() => {});

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

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
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
            <ImageGallery
              images={imageList}
              title={listing.title}
              deal={listing.deal}
              status={listing.status}
              dealColor={getDealColor(listing.deal)}
              statusColor={getStatusColor(listing.status)}
            />

            {/* 상세 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                  <Hash className="w-3 h-3" /> W-{listing.id}
                </span>
                {listing.views > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> 조회 {listing.views}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>

              <Link
                href={`/contact?listing=${listing.id}`}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                온라인 상담 신청
              </Link>

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
