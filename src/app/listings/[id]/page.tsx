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
    //   필터 없으면 임시/비공개/삭제 매물의 동·가격·주소가 <title>/<meta>/OG 에 노출됨.
    const { data: listing } = (await withTimeout(supabase
      .from('listings')
      .select('title, type, deal, dong, address, deposit, monthly, price, area_m2, source_site, ai_description, seo_keywords, seo_tags, seo_meta_description, building_purpose, business_type, station_name')
      .eq('id', id)
      .eq('status', '공개')
      .single())) as { data: any };

    if (!listing) return fallback;
    // ※ 저작권 보호: 크롤링 매물도 메타데이터는 정상 노출 (정보는 광고용)
    //   단 이미지 OG는 제공하지 않음 (사진 차단)
    const isCrawled = !!listing.source_site;

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
    // L-sec94 (2026-04-22): IDOR 차단 — SSR 본문도 status='공개' 필터 필수.
    //   비공개 매물의 주소/좌표/연락처/설명/사진/영상이 SSR HTML 에 그대로 유출되던 경로.
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
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지는 통과 (광고 노출)
    // L-sec96 (2026-04-22): sanitizePublicListing 체인 — contact/address_detail/special_notes 등
    //   FORBIDDEN 필드 제거. UI 가드(`listing.contact && ...`) 때문에 시각 회귀 없음.
    const sanitized = listing
      ? sanitizePublicListing(applyImagePolicy(listing as any))
      : listing;

    return <ListingDetailClient id={id} listing={sanitized} />;
  } catch {
    return <ListingDetailClient id={id} listing={null} />;
  }
}
