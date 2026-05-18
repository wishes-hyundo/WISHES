import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checklist', '/CLAUDE_CONTEXT.md', '/CLAUDE_BOOT.md'],
      },
    ],
    sitemap: 'https://wishes.co.kr/sitemap
