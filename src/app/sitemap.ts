import type { MetadataRoute } from 'next';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://wishes.co.kr';
  const now = new Date().toISOString();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/listings`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/map`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/calculator`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/compare`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // 동적 매물 페이지 - Supabase에서 활성 매물 가져오기
  // ※ 저작권 보호: 크롤링 매물(source_site 존재)은 sitemap에서 제외
  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServerClient();
    const { data: listings } = await supabase
      .from('listings')
      .select('id, updated_at')
      .in('status', ['공개', '예약'])
      .is('source_site', null)
      .order('updated_at', { ascending: false });

    if (listings && listings.length > 0) {
      listingPages = listings.map((listing) => ({
        url: `${baseUrl}/listings/${listing.id}`,
        lastModified: listing.updated_at || now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    }
  } catch (e) {
    // Supabase 오류 시 정적 페이지만 반환
  }

  return [...staticPages, ...listingPages];
}
