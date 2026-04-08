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
      title: `매물 상세 #${id} | WISHES`,
      description: '서울·경기 부동산 매물 상세 정보. WISHES 종합부동산',
    };
  }

  const displayTitle = listing.ai_title || listing.title || `${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''}`.trim();
  const fullTitle = `${displayTitle} | WISHES 부동산`;

  let priceInfo = '';
  if (listing.deal === '매매' && listing.price) {
    priceInfo = listing.price >= 10000 ? `매매 ${(listing.price / 10000).toFixed(listing.price % 10000 === 0 ? 0 : 1)}억` : `매매 ${listing.price}만`;
  } else if (listing.deal === '전세' && listing.deposit) {
    priceInfo = listing.deposit >= 10000 ? `전세 ${(listing.deposit / 10000).toFixed(listing.deposit % 10000 === 0 ? 0 : 1)}억` : `전세 ${listing.deposit}만`;
  } else if (listing.deposit || listing.monthly) {
    priceInfo = `보증금 ${listing.deposit || 0}만 / 월세 ${listing.monthly || 0}만`;
  }

  const defaultDesc = `${listing.gu || ''} ${listing.dong || ''} ${listing.type || ''} ${listing.deal || ''} ${priceInfo}. WISHES 종합부동산`.trim();
  const description = listing.seo_meta_description || listing.ai_description?.substring(0, 160) || defaultDesc;

  const keywords = listing.seo_keywords || `${listing.gu || ''} 부동산,${listing.dong || ''} ${listing.type || ''},${listing.deal || ''} 매물,WISHES`;

  return {
    title: fullTitle,
    description,
    keywords,
    openGraph: {
      title: fullTitle,
      description,
      type: 'website',
      siteName: 'WISHES 종합부동산',
      url: `https://wishes.co.kr/listings/${id}`,
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description,
    },
    alternates: {
      canonical: `https://wishes.co.kr/listings/${id}`,
    },
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  return <ListingDetailClient listing={listing} />;
}
