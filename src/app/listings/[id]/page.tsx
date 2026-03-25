import { Metadata } from 'next';-import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import ListingDetailClient from './ListingDetailClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

interface ListingData {
  id: string;
  title: string;
  transaction_type: string;
  property_type: string;
  address: string;
  address_detail?: string;
  area: number;
  floor: number;
  total_floors: number;
  price: number;
  deposit: number;
  monthly_rent: number;
  rooms: number;
  bathrooms: number;
  direction: string;
  move_in_date: string;
  features: string[];
  description: string;
  images: string[];
  status: string;
  building_name?: string;
  building_structure?: string;
  building_purpose?: string;
  approval_date?: string;
  elevator_count?: number;
  parking_count?: number;
  created_at: string;
  updated_at: string;
}

async function getListing(id: string): Promise<ListingData | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as ListingData;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    return { title: '매물을 찾을 수 없습니다 | 위시스부동산' };
  }

  const priceText = listing.transaction_type === '월세'
    ? `보증금 ${listing.deposit?.toLocaleString()}만원 / 월세 ${listing.monthly_rent?.toLocaleString()}만원`
    : listing.transaction_type === '전세'
      ? `전세 ${listing.price?.toLocaleString()}만원`
      : `매매 ${listing.price?.toLocaleString()}만원`;

  const pyeong = Math.round((listing.area || 0) * 0.3025);
  const title = `${listing.title} | 위시스부동산`;
  const description = `${listing.address} ${listing.property_type} ${listing.transaction_type} - ${priceText} | ${listing.area}㎡(${pyeong}평) | ${listing.rooms}룸 ${listing.bathrooms}욕실`;
  const ogImage = listing.images?.[0] || '/og-default.jpg';

  return {
    title,
    description,
    openGraph: {
      title: `${listing.title} - ${priceText}`,
      description,
      type: 'article',
      url: `https://wishes.co.kr/listings/${id}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: listing.title }],
      siteName: '위시스부동산',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${listing.title} - ${priceText}`,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: `https://wishes.co.kr/listings/${id}`,
    },
    other: {
      'naver-site-verification': '',
    }
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    notFound();
  }

  return <ListingDetailClient listing={listing} />;
}
