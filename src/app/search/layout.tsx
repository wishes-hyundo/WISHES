import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * /search 전용 레이아웃
 * Cloudflare Worker(wishes-image-proxy) referer 검증을 위해
 * 이 라우트에서만 Referer 정책을 unsafe-url 로 설정.
 * /, /map, /listings 등 고객 페이지에는 영향 없음.
 */
export const metadata: Metadata = {
  title: '중개사 포털',
  description: 'WISHES 중개사 전용 매물 검색 포털',
  referrer: 'unsafe-url',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SearchLayout({ children }: { children: ReactNode }) {
  return children;
}
