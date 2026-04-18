import { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import ListingDetailClient from './ListingDetailClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

// 5초 타임아웃 래퍼
const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

function formatPrice(price: number): string {
  if (price >= 10000) {
    const uk = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? uk + '억 ' + remainder.toLocaleString() : uk + '억';
  }
  return price.toLocaleString();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fallback = { title: '매물 상세' };
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const { data: listing } = await withTimeout(supabase
      .from('listings')
      .select('title, type, deal, dong, address, deposit, monthly, price, area_m2, source_site, ai_description, ai_keywords, ai_tags, ai_meta_description, seo_keywords, seo_tags, seo_meta_description, building_purpose, business_type, station_name')
      .eq('id', id)
      .single());

    if (!listing) return fallback;
    // ※ 저작권 보호: 크롤링 매물도 메타데이터는 정상 노출 (정보는 광고용)
    //   단 이미지 OG는 제공하지 않음 (사진 차단)
    const isCrawled = !!listing.source_site;

    const priceText = listing.deal === '월세'
      ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
      : formatPrice(listing.price || listing.deposit) + '만원';

    const title = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

    // ─ description: seo_meta_description > ai_meta_description > ai_description > fallback (검색엔진 노출용 최대 160자)
    const rawDesc =
      listing.seo_meta_description
      || listing.ai_meta_description
      || listing.ai_description
      || (listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText);
    const description = String(rawDesc).replace(/\s+/g, ' ').trim().slice(0, 160);

    // ─ keywords: AI·SEO 키워드/태그 통합 + 정적 기본어 (중복 제거, 공백 trim, 빈 값 필터)
    const mergedKeywords = Array.from(new Set(
      [
        ...(Array.isArray(listing.seo_keywords) ? listing.seo_keywords : []),
        ...(Array.isArray(listing.ai_keywords) ? listing.ai_keywords : []),
        ...(Array.isArray(listing.seo_tags) ? listing.seo_tags : []),
        ...(Array.isArray(listing.ai_tags) ? listing.ai_tags : []),
        listing.dong, listing.type, listing.deal,
        listing.building_purpose, listing.business_type, listing.station_name,
        '부동산', '매물', '위시스부동산',
      ]
        .map((k: any) => (typeof k === 'string' ? k.trim() : ''))
        .filter((k) => k.length > 0)
    ));

    // 동적 OG 이미지 — 자체 렌더 카드 (외부 사진 미사용 → 크롤링 매물도 안전)
    const ogImageUrl = 'https://wishes.co.kr/api/og/listing/' + id;

    return {
      title,
      description,
      keywords: mergedKeywords.join(', '),
      openGraph: {
        title: title + ' | WISHES',
        description,
        url: 'https://wishes.co.kr/listings/' + id,
        siteName: 'WISHES',
        type: 'article',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: title + ' | WISHES',
        description,
        images: [ogImageUrl],
      },
      alternates: {
        canonical: 'https://wishes.co.kr/listings/' + id,
      },
      // 크롤링 매물: 이미지 저작권 리스크로 검색엔진 인덱스에선 제외 (정보는 페이지에 노출됨)
      ...(isCrawled ? { robots: { index: false, follow: true } } : {}),
    };
  } catch {
    return fallback;
  }
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  try {
    const supabase = createServerClient();
    const { data: listing } = await withTimeout(supabase
      .from('listings')
      .select(`
        id, title, type, deal, status, dong, gu, address, address_detail,
        lat, lng, deposit, monthly, price, area_m2, area_supply_m2,
        floor_current, floor_total, rooms, bathrooms, direction, heating_type,
        available_date, built_year, ai_description, ai_tags, ai_keywords,
        seo_tags, seo_keywords, seo_meta_description,
        building_name, building_purpose,
        parking, elevator, pet, balcony, full_option, loan_available,
        maintenance_fee, maintenance_includes, entrance_type, lease_period,
        business_type, goodwill_fee, vat_included, usage_approved,
        electric_capacity, signage_available, meeting_room,
        previous_business, recommended_business, restricted_business,
        parking_spaces, rights_fee, parking_fee, commission_fee, previous_brand,
        special_notes, views, created_at, updated_at, contact, source_site,
        listing_images(url, sort_order), listing_features(feature)
      `)
      .eq('id', id)
      .single());

    // ※ 저작권 보호: 크롤링 매물(source_site)도 상세 정보 노출 (광고용)
    //   단 사진(listing_images)은 빈 배열로 치환 — 상세 페이지는 플레이스홀더 렌더
    const sanitized = listing && listing.source_site
      ? { ...listing, listing_images: [] }
      : listing;

    return <ListingDetailClient id={id} listing={sanitized} />;
  } catch {
    return <ListingDetailClient id={id} listing={null} />;
  }
}
