import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ListingDetailClient from './ListingDetailClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  const { data: listing } = await supabase
    .from('listings')
    .select('title, type, deal, dong, gu, address, deposit, monthly, price, area_m2, ai_title, ai_description, seo_keywords, seo_tags, seo_meta_description')
    .eq('id', id)
    .single();

  if (!listing) {
    return {
      title: 'WISHES | 서울·경기 종합부동산',
      description: '서울·경기 부동산 매물 상세 정보',
    };
  }

  const displayTitle = listing.ai_title || listing.title || `${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''}`;
  const dongGu = [listing.dong, listing.gu].filter(Boolean).join(' ');
  const priceInfo = listing.deal === '매매'
    ? (listing.price ? `${listing.price >= 10000 ? (listing.price / 10000).toFixed(1) + '억' : listing.price + '만'}` : '')
    : listing.deal === '전세'
    ? (listing.deposit ? `보증금 ${listing.deposit >= 10000 ? (listing.deposit / 10000).toFixed(1) + '억' : listing.deposit + '만'}` : '')
    : (listing.deposit ? `${listing.deposit}만/${listing.monthly || 0}만` : '');

  const seoTitle = `${displayTitle} | WISHES 부동산`;
  const seoDesc = listing.seo_meta_description
    || listing.ai_description?.substring(0, 155)
    || `${dongGu} ${listing.type} ${listing.deal} ${priceInfo}. WISHES 종합부동산과 함께 나에게 딱 맞는 매물을 찾아보세요.`;
  const keywords = listing.seo_keywords
    || [`${listing.dong} ${listing.type}`, `${listing.gu} ${listing.deal}`, `${listing.dong} 월세`, `${listing.dong} 전세`, '서울 부동산', 'WISHES'];

  return {
    title: seoTitle,
    description: seoDesc,
    keywords: Array.isArray(keywords) ? keywords.join(', ') : keywords,
    openGraph: {
      title: seoTitle,
      description: seoDesc,
      type: 'website',
      siteName: 'WISHES 종합부동산',
      url: `https://wishes.co.kr/listings/${id}`,
    },
    twitter: {
      card: 'summary',
      title: seoTitle,
      description: seoDesc,
    },
    alternates: {
      canonical: `https://wishes.co.kr/listings/${id}`,
    },
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">매물을 찾을 수 없습니다</h1>
          <p className="text-gray-500">요청하신 매물 정보가 존재하지 않습니다.</p>
        </div>
      </div>
    );
  }

  return <ListingDetailClient listing={listing} />;
}import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ListingDetailClient from './ListingDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

// Supabase 익명 클라이언트 (SEO 메타데이터 생성용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: listing } = await supabase
      .from('properties')
      .select('title, property_type, transaction_type, address_dong, address_gu, deposit, monthly_rent, sale_price, area_m2, floor_info, images')
      .eq('id', id)
      .single();

    if (listing) {
      // 동적 타이틀 생성: "관악구 봉천동 오피스텔 월세"
      const location = [listing.address_gu, listing.address_dong].filter(Boolean).join(' ');
      const typeLabel = listing.property_type || '';
      const txLabel = listing.transaction_type || '';
      const pageTitle = [location, typeLabel, txLabel].filter(Boolean).join(' ') || listing.title || `매물 #${id}`;

      // 동적 설명 생성: 가격 + 면적 + 층수
      const priceParts = [];
      if (listing.deposit) priceParts.push(`보증금 ${(listing.deposit / 10000).toLocaleString()}만원`);
      if (listing.monthly_rent) priceParts.push(`월세 ${(listing.monthly_rent / 10000).toLocaleString()}만원`);
      if (listing.sale_price) priceParts.push(`매매가 ${(listing.sale_price / 10000).toLocaleString()}만원`);
      const priceStr = priceParts.join('/');
      const areaStr = listing.area_m2 ? `${listing.area_m2}m²` : '';
      const floorStr = listing.floor_info || '';
      const descParts = [priceStr, areaStr, floorStr].filter(Boolean);
      const description = descParts.length > 0
        ? `${location} ${typeLabel} ${txLabel} 매물. ${descParts.join(', ')}. WISHES에서 상세 정보를 확인하세요.`
        : `${location} ${typeLabel} ${txLabel} 매물 상세 정보. WISHES 서울·경기 종합부동산`;

      // OG 이미지
      const ogImage = listing.images && listing.images.length > 0
        ? listing.images[0]
        : '/og-image.png';

      return {
        title: pageTitle,
        description,
        alternates: {
          canonical: `https://wishes.co.kr/listings/${id}`,
        },
        openGraph: {
          title: `${pageTitle} | WISHES`,
          description,
          url: `https://wishes.co.kr/listings/${id}`,
          images: [{ url: ogImage, width: 1200, height: 630, alt: pageTitle }],
          type: 'article',
        },
        twitter: {
          card: 'summary_large_image',
          title: `${pageTitle} | WISHES`,
          description,
          images: [ogImage],
        },
      };
    }
  } catch (error) {
    console.error('generateMetadata error:', error);
  }

  // 펴백: 데이터 조회 실패 시 기본값
  return {
    title: `매물 상세 #${id}`,
    description: '서울·경기 부동산 매물 상세 정보. WISHES 종합부동산',
    alternates: {
      canonical: `https://wishes.co.kr/listings/${id}`,
    },
  };
}

// 정적 shell + 클라이언트 데이터 페칭 → 즐시 로드
export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
