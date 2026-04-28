import { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import { applyImagePolicy } from '@/lib/image-policy';
// L-sec96 (2026-04-22): SSR 도 FORBIDDEN_PUBLIC_KEYS strip.
import { sanitizePublicListing } from '@/lib/listing-public';
import ListingDetailClient from './ListingDetailClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

// 5초 타임아웃 래퍼 (Supabase PostgrestBuilder는 Promise가 아닌 PromiseLike라 PromiseLike 시그니처로)
const withTimeout = <T,>(promise: PromiseLike<T>, ms = 5000): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

function formatPrice(price: number | null | undefined): string {
  // L-fix-unit (2026-04-28): 단위 '만원' 명시. 사장님 발견 — "1억5000" 만 단위 누락
  if (!price || price <= 0) return '-';
  if (price >= 10000) {
    const uk = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? uk + '억 ' + remainder.toLocaleString() + '만원' : uk + '억원';
  }
  return price.toLocaleString() + '만원';
}

// L-seo1 (2026-04-27 v3): 자체 콘텐츠 검사 (page + sitemap 일관)
function checkHasOwnContent(listing: any): boolean {
  return !!(
    (listing.ai_description && String(listing.ai_description).trim().length > 30)
    || (listing.description && String(listing.description).trim().length > 30)
    || (listing.seo_meta_description && String(listing.seo_meta_description).trim().length > 30)
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fallback = { title: '매물 상세' };
  try {
    const { id } = await params;
    const supabase = createServerClient();
    // L-sec94 (2026-04-22): IDOR 차단 — SSR metadata 도 공개 매물만 조회.
    const { data: listing } = (await withTimeout(supabase
      .from('listings')
      .select('title, type, deal, dong, address, deposit, monthly, price, area_m2, source_site, ai_description, description, seo_keywords, seo_tags, seo_meta_description, building_purpose, business_type, station_name')
      .eq('id', id)
      .eq('status', '공개')
      .single())) as { data: any };

    if (!listing) return fallback;

    // L-seo1 (2026-04-27 v3 세션): SEO 우선 정책 — 자체 콘텐츠 있는 매물 색인 허용.
    const hasOwnContent = checkHasOwnContent(listing);

    const priceText = listing.deal === '월세'
      ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
      : formatPrice(listing.price || listing.deposit) + '만원';

    const title = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

    const rawDesc =
      listing.seo_meta_description
      || listing.ai_description
      || (listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText);
    const description = String(rawDesc).replace(/\s+/g, ' ').trim().slice(0, 160);

    const mergedKeywords = Array.from(new Set(
      [
        ...(Array.isArray(listing.seo_keywords) ? listing.seo_keywords : []),
        ...(Array.isArray(listing.seo_tags) ? listing.seo_tags : []),
        listing.dong, listing.type, listing.deal,
        listing.building_purpose, listing.business_type, listing.station_name,
        '부동산', '매물', '위시스부동산',
      ]
        .map((k: any) => (typeof k === 'string' ? k.trim() : ''))
        .filter((k) => k.length > 0)
    ));

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
      ...(hasOwnContent ? {} : { robots: { index: false, follow: true } }),
    };
  } catch {
    return fallback;
  }
}

// L-seo2 (2026-04-27 v3): RealEstateListing JSON-LD 생성 (구글 리치 결과)
function buildJsonLd(listing: any, id: string): Record<string, any> | null {
  if (!listing) return null;

  // L-fix-unit (2026-04-28): formatPrice 가 이미 '만원' 포함 → 중복 제거
  const priceText = listing.deal === '월세'
    ? formatPrice(listing.deposit) + ' / ' + formatPrice(listing.monthly)
    : formatPrice(listing.price || listing.deposit);
  const name = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

  // 가격 (Offer): 월세는 monthly, 전세/매매는 price 또는 deposit
  let priceWon = 0;
  if (listing.deal === '월세') priceWon = (listing.monthly || 0) * 10000;
  else priceWon = ((listing.price || listing.deposit || 0) as number) * 10000;

  const description = String(
    listing.seo_meta_description || listing.ai_description || listing.description || name
  ).replace(/\s+/g, ' ').trim().slice(0, 300);

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': name,
    'description': description,
    'url': 'https://wishes.co.kr/listings/' + id,
    'image': 'https://wishes.co.kr/api/og/listing/' + id,
    'datePosted': listing.created_at,
    'dateModified': listing.updated_at,
  };

  if (listing.address) {
    // L-fix-region (2026-04-28): addressRegion 동적 (전국 17 시도, 사장님 정책)
    //   주소 첫 토큰 → 시/도 정확 매핑 (서울 박제 X)
    const REGION_MAP: Record<string, string> = {
      '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시',
      '인천': '인천광역시', '광주': '광주광역시', '대전': '대전광역시',
      '울산': '울산광역시', '세종': '세종특별자치시', '경기': '경기도',
      '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
      '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도',
      '경남': '경상남도', '제주': '제주특별자치도',
    };
    const firstTok = (listing.address || '').trim().split(/\s+/)[0] || '';
    const detected = Object.keys(REGION_MAP).find(k => firstTok.startsWith(k));
    const region = detected ? REGION_MAP[detected] : (listing.region || '서울특별시');
    jsonLd['address'] = {
      '@type': 'PostalAddress',
      'streetAddress': listing.address,
      'addressLocality': listing.gu || listing.dong,
      'addressRegion': region,
      'addressCountry': 'KR',
    };
  }

  if (listing.lat && listing.lng) {
    jsonLd['geo'] = {
      '@type': 'GeoCoordinates',
      'latitude': listing.lat,
      'longitude': listing.lng,
    };
  }

  if (priceWon > 0) {
    jsonLd['offers'] = {
      '@type': 'Offer',
      'price': priceWon,
      'priceCurrency': 'KRW',
      'availability': listing.status === '공개' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability',
      'url': 'https://wishes.co.kr/listings/' + id,
    };
  }

  if (listing.area_m2 && listing.area_m2 > 0) {
    jsonLd['floorSize'] = {
      '@type': 'QuantitativeValue',
      'value': listing.area_m2,
      'unitCode': 'MTK', // 제곱미터
    };
  }

  if (listing.rooms && listing.rooms > 0) {
    jsonLd['numberOfRooms'] = listing.rooms;
  }

  if (listing.bathrooms && listing.bathrooms > 0) {
    jsonLd['numberOfBathroomsTotal'] = listing.bathrooms;
  }

  if (listing.built_year) {
    const yearStr = String(listing.built_year).match(/\d{4}/);
    if (yearStr) jsonLd['yearBuilt'] = parseInt(yearStr[0]);
  }

  return jsonLd;
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  try {
    const supabase = createServerClient();
    // L-sec94 (2026-04-22): IDOR 차단 — SSR 본문도 status='공개' 필터 필수.
    const { data: listing } = (await withTimeout(supabase
      .from('listings')
      .select(`
        id, title, ai_title, type, deal, status, dong, gu, address, address_detail,
        lat, lng, deposit, monthly, price, area_m2, area_pyeong, area_supply_m2,
        floor_current, floor_total, rooms, bathrooms, direction, heating_type,
        available_date, built_year, ai_description, description,
        seo_tags, seo_keywords, seo_meta_description,
        building_name, building_purpose,
        station_name, station_distance, features,
        parking, elevator, pet, balcony, full_option, loan_available,
        maintenance_fee, maintenance_includes, entrance_type, lease_period,
        business_type, goodwill_fee, vat_included, usage_approved,
        electric_capacity, signage_available, meeting_room,
        previous_business, recommended_business, restricted_business,
        parking_spaces, rights_fee, parking_fee, commission_fee, previous_brand,
        special_notes, views, created_at, updated_at, contact, source_site,
        room_layout, is_duplex, illegal_building, last_verified_at, total_parking_spaces,
        listing_images(url, sort_order), listing_features(feature),
        listing_videos(id, url, poster_url, mime_type, sort_order)
      `)
      .eq('id', id)
      .eq('status', '공개')
      .single())) as { data: any };

    const sanitized = listing
      ? sanitizePublicListing(applyImagePolicy(listing as any))
      : listing;

    // L-seo2 (2026-04-27 v3): 자체 콘텐츠 있는 매물에만 JSON-LD inject
    //   (noindex 매물에 schema 데이터 올리는 건 무의미 + 일관성)
    const jsonLd = sanitized && checkHasOwnContent(sanitized)
      ? buildJsonLd(sanitized, id)
      : null;

    return (
      <>
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
        <ListingDetailClient id={id} listing={sanitized} />
      </>
    );
  } catch {
    return <ListingDetailClient id={id} listing={null} />;
  }
}
