// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map — 서버 엔트리 (RSC)
//
//   2026-04-21 마이그레이션: 레거시 /map 페이지를 제거하고 MAP 2026
//   (Phase A~F, Category-First + Semantic Zoom + Hero Pin + 3D +
//   Cinematic Motion + Comparable-Aware) 을 canonical /map 경로로 승격.
//   기존 /map-2026 URL 은 next.config.js 에서 301 리디렉트로 보존.
//
//   기본 SEO 메타는 src/app/map/layout.tsx 가 관리. 본 page.tsx 의
//   generateMetadata 가 searchParams.listing (또는 path) 받으면 매물별
//   동적 SSR metadata + RealEstateListing JSON-LD 생성 (PR-D2 v2).
//
//   /listings/:id → /map/:id 301 redirect (next.config.js L-listings-deprecate)
//   /map?listing=:id 도 동등 (CLAUDE.md 영구 요구사항).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import MapClientWrapper from './MapClientWrapper';
import { withTimeout } from '@/lib/withTimeout';

type Props = {
  searchParams: Promise<{ listing?: string; [k: string]: string | string[] | undefined }>;
};



function formatPrice(price: number): string {
  if (price >= 10000) {
    const uk = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? uk + '억 ' + remainder.toLocaleString() : uk + '억';
  }
  return price.toLocaleString();
}

// L-seo1 v3 일관 — 자체 콘텐츠 30자+ 매물만 인덱스 허용
function checkHasOwnContent(listing: {
  ai_description?: string | null;
  description?: string | null;
  seo_meta_description?: string | null;
}): boolean {
  return !!(
    (listing.ai_description && String(listing.ai_description).trim().length > 30) ||
    (listing.description && String(listing.description).trim().length > 30) ||
    (listing.seo_meta_description && String(listing.seo_meta_description).trim().length > 30)
  );
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const listingId = typeof params.listing === 'string' ? params.listing : null;

  // listing query 없음 → 기본 /map metadata (layout 의 정적 metadata 가 fallback)
  if (!listingId || !/^\d+$/.test(listingId)) {
    return {};
  }

  // listing=ID → 매물별 SSR metadata
  const fallback: Metadata = {
    title: '매물 상세 | 지도검색',
    alternates: { canonical: 'https://wishes.co.kr/map?listing=' + listingId },
  };
  try {
    const supabase = createServerClient();
    const { data: listing } = (await withTimeout(
      supabase
        .from('listings')
        .select(
          'title, type, deal, dong, gu, address, deposit, monthly, price, area_m2, source_site, ai_description, description, seo_keywords, seo_tags, seo_meta_description, building_purpose, business_type, station_name'
        )
        .eq('id', listingId)
        .eq('status', '공개')
        .single(),
      5000
    )) as { data: any };

    if (!listing) return fallback;

    const hasOwnContent = checkHasOwnContent(listing);

    const priceText =
      listing.deal === '월세'
        ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
        : formatPrice(listing.price || listing.deposit) + '만원';

    const title = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;
    const rawDesc =
      listing.seo_meta_description ||
      listing.ai_description ||
      listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;
    const description = String(rawDesc).replace(/\s+/g, ' ').trim().slice(0, 160);

    const mergedKeywords = Array.from(
      new Set(
        [
          ...(Array.isArray(listing.seo_keywords) ? listing.seo_keywords : []),
          ...(Array.isArray(listing.seo_tags) ? listing.seo_tags : []),
          listing.dong, listing.type, listing.deal,
          listing.building_purpose, listing.business_type, listing.station_name,
          '부동산', '매물', '위시스부동산',
        ]
          .map((k: any) => (typeof k === 'string' ? k.trim() : ''))
          .filter((k) => k.length > 0)
      )
    );

    const canonical = 'https://wishes.co.kr/map?listing=' + listingId;
    const ogImageUrl = 'https://wishes.co.kr/api/og/listing/' + listingId;

    return {
      title,
      description,
      keywords: mergedKeywords.join(', '),
      openGraph: {
        title: title + ' | WISHES',
        description,
        url: canonical,
        siteName: 'WISHES',
        type: 'article',
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: 'summary_large_image',
        title: title + ' | WISHES',
        description,
        images: [ogImageUrl],
      },
      alternates: { canonical },
      ...(hasOwnContent ? {} : { robots: { index: false, follow: true } }),
    };
  } catch {
    return fallback;
  }
}

// L-seo2 v3 일관 — RealEstateListing JSON-LD (구글 리치 결과)
function buildJsonLd(listing: any, id: string): Record<string, any> | null {
  if (!listing) return null;

  const priceText =
    listing.deal === '월세'
      ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
      : formatPrice(listing.price || listing.deposit) + '만원';
  const name = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

  let priceWon = 0;
  if (listing.deal === '월세') priceWon = (listing.monthly || 0) * 10000;
  else priceWon = ((listing.price || listing.deposit || 0) as number) * 10000;

  const description = String(
    listing.seo_meta_description || listing.ai_description || listing.description || name
  ).replace(/\s+/g, ' ').trim().slice(0, 300);

  const url = 'https://wishes.co.kr/map?listing=' + id;
  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name, description, url,
    image: 'https://wishes.co.kr/api/og/listing/' + id,
    datePosted: listing.created_at,
    dateModified: listing.updated_at,
  };

  if (listing.address) {
    jsonLd['address'] = {
      '@type': 'PostalAddress',
      streetAddress: listing.address,
      addressLocality: listing.gu || listing.dong,
      addressRegion: '서울특별시',
      addressCountry: 'KR',
    };
  }
  if (listing.lat && listing.lng) {
    // [Step M-2 follow-up 2026-05-18] SSR 에선 인증 모름 → 무조건 100m round 마스킹
    //   정확한 좌표는 client (지도 컴포넌트) 가 로그인 시 별도 fetch
    jsonLd['geo'] = {
      '@type': 'GeoCoordinates',
      latitude: Math.round(listing.lat * 1000) / 1000,
      longitude: Math.round(listing.lng * 1000) / 1000,
    };
  }
  if (priceWon > 0) {
    jsonLd['offers'] = {
      '@type': 'Offer',
      price: priceWon,
      priceCurrency: 'KRW',
      availability:
        listing.status === '공개' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability',
      url,
    };
  }
  if (listing.area_m2 && listing.area_m2 > 0) {
    jsonLd['floorSize'] = {
      '@type': 'QuantitativeValue',
      value: listing.area_m2,
      unitCode: 'MTK',
    };
  }
  if (listing.rooms && listing.rooms > 0) jsonLd['numberOfRooms'] = listing.rooms;
  if (listing.bathrooms && listing.bathrooms > 0) jsonLd['numberOfBathroomsTotal'] = listing.bathrooms;
  if (listing.built_year) {
    const yearStr = String(listing.built_year).match(/\d{4}/);
    if (yearStr) jsonLd['yearBuilt'] = parseInt(yearStr[0]);
  }

  return jsonLd;
}

export default async function MapPage({ searchParams }: Props) {
  const params = await searchParams;
  const listingId = typeof params.listing === 'string' ? params.listing : null;

  let jsonLd: Record<string, any> | null = null;
  if (listingId && /^\d+$/.test(listingId)) {
    try {
      const supabase = createServerClient();
      const { data: listing } = (await withTimeout(
        supabase
          .from('listings')
          .select(
            'id, title, type, deal, status, dong, gu, address, lat, lng, deposit, monthly, price, area_m2, rooms, bathrooms, built_year, ai_description, description, seo_meta_description, created_at, updated_at'
          )
          .eq('id', listingId)
          .eq('status', '공개')
          .single(),
        5000
      )) as { data: any };

      if (listing && checkHasOwnContent(listing)) {
        jsonLd = buildJsonLd(listing, listingId);
      }
    } catch {
      // SSR JSON-LD 실패는 silent — 페이지 자체는 정상 렌더
    }
  }

  return (
    <div className="h-full w-full">
      {/* L-naver-2026prefetch1 (2026-04-26): GeoJSON 프리페치 */}
      <link rel="prefetch" href="/api/geo/sido" as="fetch" crossOrigin="anonymous" />
      <link rel="prefetch" href="/api/geo/sigungu" as="fetch" crossOrigin="anonymous" />
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <MapClientWrapper />
    </div>
  );
}
