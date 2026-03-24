import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient();

  const { data: allListings } = await supabase
    .from('listings')
    .select('id, updated_at')
    .eq('status', '가용');

  const listingUrls = (allListings || []).map((listing) => ({
    url: `https://wishes.co.kr/listings/${listing.id}`,
    lastModified: new Date(listing.updated_at),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  return [
    {
      url: 'https://wishes.co.kr',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://wishes.co.kr/listings',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://wishes.co.kr/map',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://wishes.co.kr/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://wishes.co.kr/contact',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...listingUrls,
  ];
}
