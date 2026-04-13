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
  const fallback = { title: '매물 상세 | WISHES' };
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const { data: listing } = await withTimeout(supabase
      .from('listings')
      .select('title, type, deal, dong, address, deposit, monthly, price, area_m2')
      .eq('id', id)
      .single());

    if (!listing) return fallback;

    const priceText = listing.deal === '월세'
      ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
      : formatPrice(listing.price || listing.deposit) + '만원';

    const title = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;
    const description = listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;

    return {
      title: title + ' | WISHES',
      description,
      keywords: [listing.dong, listing.type, listing.deal, '부동산', '매물'].join(', '),
      openGraph: {
        title: title + ' | WISHES',
        description,
        url: 'https://wishes.co.kr/listings/' + id,
        siteName: 'WISHES',
        type: 'article',
      },
      twitter: {
        card: 'summary',
        title: title + ' | WISHES',
        description,
      },
      alternates: {
        canonical: 'https://wishes.co.kr/listings/' + id,
      },
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
        available_date, built_year, ai_description, building_name, building_purpose,
        parking, elevator, pet, balcony, full_option, loan_available,
        maintenance_fee, maintenance_includes, entrance_type, lease_period,
        business_type, goodwill_fee, vat_included, usage_approved,
        electric_capacity, signage_available, meeting_room,
        previous_business, recommended_business, restricted_business,
        parking_spaces, rights_fee, parking_fee, commission_fee, previous_brand,
        special_notes, views, created_at, updated_at, contact,
        listing_images(url, sort_order), listing_features(feature)
      `)
      .eq('id', id)
      .single());

    return <ListingDetailClient id={id} listing={listing} />;
  } catch {
    return <ListingDetailClient id={id} listing={null} />;
  }
}
