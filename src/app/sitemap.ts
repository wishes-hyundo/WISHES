import type { MetadataRoute } from 'next';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────────────────
// 2026-04-21 audit fix:
//   기존 sitemap이 try/catch로 Supabase 에러를 삼켜 프로덕션에서 9개
//   정적 URL만 노출되는 SEO 블랙홀이 발생. /listings/[id] 전체가 검색엔진에
//   미색인.
//
//   1) catch에서 console.error 로 원인 노출 (Vercel Logs에서 즉시 확인)
//   2) PostgREST 1000행 기본 제한을 넘기 위한 .range() 페이지네이션
//   3) 각 단계 개수 로그 → 배포 후 Vercel Logs 로 검증 가능
//
// 2026-04-21 policy update (B):
//   기존엔 저작권 보호 명목으로 `source_site IS NULL` 만 노출.
//   현실: DB 전체 공개 매물 3,577건이 전부 크롤링 매물 → sitemap 실질 0건.
//   → `source_site` 필터 제거, 공개/예약 상태 매물 전량 포함.
//
// L-seo1 (2026-04-27 v3 세션):
//   listings/[id]/page.tsx 의 hasOwnContent 정책과 일관화.
//   sitemap 에는 색인 OK 매물 (자체 콘텐츠 있는 매물) 만 포함.
//   → 구글이 noindex 페이지 fetch 후 거부받는 낭비 제거.
//   → cron 보강 진행되면서 sitemap URL 자동 증가.
//   기준: ai_description / description / seo_meta_description 중 하나 이상 30자+
// ────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // 최대 50,000 URL (Google sitemap 단일 파일 한도)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://wishes.co.kr';
  const now = new Date().toISOString();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: baseUrl + '/map', lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: baseUrl + '/calculator', lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: baseUrl + '/about', lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: baseUrl + '/contact', lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: baseUrl + '/privacy', lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: baseUrl + '/terms', lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // 동적 매물 페이지 — 색인 OK 매물 (자체 콘텐츠 있는 것만, 저작권 안전)
  const listingPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServerClient();

    for (let page = 0; page < MAX_PAGES; page++) {
      const fromIdx = page * PAGE_SIZE;
      const toIdx = fromIdx + PAGE_SIZE - 1;

      // L-seo1: 자체 콘텐츠 있는 매물만 (page.tsx 의 hasOwnContent 와 일관)
      const { data, error } = await supabase
        .from('listings')
        .select('id, updated_at, ai_description, description, seo_meta_description')
        .in('status', ['공개', '예약'])
        .order('updated_at', { ascending: false })
        .range(fromIdx, toIdx);

      if (error) {
        console.error('[sitemap] Supabase query error', {
          page,
          code: error.code,
          message: error.message,
        });
        break;
      }

      if (!data || data.length === 0) break;

      for (const listing of data) {
        const hasOwnContent = !!(
          (listing.ai_description && String(listing.ai_description).trim().length > 30)
          || (listing.description && String(listing.description).trim().length > 30)
          || (listing.seo_meta_description && String(listing.seo_meta_description).trim().length > 30)
        );
        if (!hasOwnContent) continue;

        listingPages.push({
          url: baseUrl + '/map?listing=' + listing.id,
          lastModified: listing.updated_at || now,
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        });
      }

      if (data.length < PAGE_SIZE) break;
    }

    console.log('[sitemap] static=' + staticPages.length + ' listings=' + listingPages.length);
  } catch (e) {
    console.error('[sitemap] fatal error building listing URLs', e);
  }

  return [...staticPages, ...listingPages];
}
