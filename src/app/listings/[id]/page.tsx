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
    // L-sec94 (2026-04-22): IDOR 차단 — SSR metadata 도 공개 매물만 조회.
    const { data: listing } = (await withTimeout(supabase
      .from('listings')
      .select('title, type, deal, dong, address, deposit, monthly, price, area_m2, source_site, ai_description, description, seo_keywords, seo_tags, seo_meta_description, building_purpose, business_type, station_name')
      .eq('id', id)
      .eq('status', '공개')
      .single())) as { data: any };

    if (!listing) return fallback;

    // L-seo1 (2026-04-27 v3 세션): SEO 우선 정책 — 자체 콘텐츠 있는 매물 색인 허용.
    //   기존 정책: source_site 있는 모든 크롤링 매물 noindex (= 12,114/12,115건 색인 차단)
    //   신 정책: ai_description / description / seo_meta_description 중 하나라도 30자 이상 있는
    //           매물은 색인 허용 (저작권 안전: title/desc/이미지 모두 자체 생성). cron 으로 ai_description
    //           보강 진행되면서 색인 매물 수 점진 증가. 사용자 명시 — "구글/네이버 무조건 노출".
    const hasOwnContent = !!(
      (listing.ai_description && String(listing.ai_description).trim().length > 30)
      || (listing.description && String(listing.description).trim().length > 30)
      || (listing.seo_meta_description && String(listing.seo_meta_description).trim().length > 30)
    );

    const priceText = listing.deal === '월세'
      ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
      : formatPrice(listing.price || listing.deposit) + '만원';

    const title = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

    // ─ description: seo_meta_description > ai_description > fallback (검색엔진 노출용 최대 160자)
    const rawDesc =
      listing.seo_meta_description
      || listing.ai_description
      || (listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText);
    const description = String(rawDesc).replace(/\s+/g, ' ').trim().slice(0, 160);

    // ─ keywords: SEO 키워드/태그 통합 + 정적 기본어 (중복 제거, 공백 trim, 빈 값 필터)
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
      // L-seo1 (2026-04-27 v3): 자체 콘텐츠 있는 매물만 색인 (저작권 안전)
      //   미보강 매물은 noindex 유지 → cron 보강 진행으로 점진적으로 색인 매물 수 증가
      ...(hasOwnContent ? {} : { robots: { index: false, follow: true } }),
    };
  } catch {
    return fallback;
  }
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

    // ※ 저작권 보호 + 자체 업로드 통과
    const sanitized = listing
      ? sanitizePublicListing(applyImagePolicy(listing as any))
      : listing;

    return <ListingDetailClient id={id} listing={sanitized} />;
  } catch {
    return <ListingDetailClient id={id} listing={null} />;
  }
}
