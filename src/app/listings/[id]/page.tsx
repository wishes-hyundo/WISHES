import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import ListingDetailClient from './ListingDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

function formatPrice(listing: any): string {
  if (listing.deal === '매매') {
    const price = listing.price || 0;
    if (price >= 10000) return `${Math.floor(price / 10000)}억${price % 10000 > 0 ? ' ' + (price % 10000) : ''}`;
    return `${price.toLocaleString()}만원`;
  }
  return `${listing.deposit?.toLocaleString() || 0}/${listing.monthly?.toLocaleString() || 0}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('title, dong, type, deal, deposit, monthly, price, address, area_m2, images:listing_images(url, is_thumbnail)')
    .eq('id', id)
    .single();

  if (!listing) {
    return {
      title: '매물 상세 | WISHES',
      description: '서울·경기 부동산 매물 상세 정보',
    };
  }

  const priceText = formatPrice(listing);
  const title = `${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''} ${priceText} | WISHES`;
  const desc = `${listing.title || ''} - ${listing.address || ''}${listing.area_m2 ? ', ' + listing.area_m2 + '㎡' : ''}. 서울·경기 부동산 전문 WISHES`;

  const thumbnail = listing.images?.find((img: any) => img.is_thumbnail)?.url
    || listing.images?.[0]?.url
    || 'https://wishes.co.kr/og-default.png';

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url: `https://wishes.co.kr/listings/${id}`,
      siteName: 'WISHES',
      images: [{ url: thumbnail, width: 1200, height: 630, alt: listing.title || '매물 이미지' }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [thumbnail],
    },
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
