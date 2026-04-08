import { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase';
import ListingDetailClient from './ListingDetailClient';

type Props = { params: Promise<{ id: string }> };

function formatPrice(price: number): string {
  if (price >= 10000) {
    const uk = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? uk + '억 ' + remainder.toLocaleString() : uk + '억';
  }
  return price.toLocaleString();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: listing } = await supabase
    .from('listings')
    .select('title, type, deal, dong, gu, address, deposit, monthly, price, area_m2, ai_title, ai_description, seo_keywords, seo_tags, seo_meta_description')
    .eq('id', id)
    .single();

  if (!listing) {
    return { title: '매물 상세 | WISHES' };
  }

  const priceText = listing.deal === '월세'
    ? formatPrice(listing.deposit) + '/' + formatPrice(listing.monthly) + '만원'
    : formatPrice(listing.price || listing.deposit) + '만원';

  const title = listing.ai_title
    || listing.dong + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;
  const description = listing.seo_meta_description
    || listing.ai_description
    || listing.dong + ' ' + listing.gu + ' ' + listing.type + ' ' + listing.deal + ' ' + priceText;
  const keywords = listing.seo_keywords
    || [listing.dong, listing.gu, listing.type, listing.deal, '부동산', '매물'].join(', ');

  return {
    title: title + ' | WISHES',
    description,
    keywords,
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
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  return <ListingDetailClient listing={listing} />;
}
