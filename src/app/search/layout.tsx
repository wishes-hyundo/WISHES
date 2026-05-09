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
  referrer: 'unsafe-url' as Metadata['referrer'],
  robots: {
    index: false,
    follow: false,
  },
};

// L-perf-step-g (2026-05-09 사장님 SOTA Phase 1): /search 전용 매물 사진 CDN 사전 연결.
//   매물 카드 사진들이 외부 CDN 4곳에 분산됨 - 첫 사진 로드 시 DNS + TLS 비용.
//   preconnect 로 페이지 진입 즉시 백그라운드 연결 - 사진 fetch 시 0 RTT.
//   영향: /search 만, 다른 페이지 (/map, /) 무영향.
export default function SearchLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://resource.zigbang.io" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://d4k1brqee4emz.cloudfront.net" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://wishes-image-proxy.wishes-img.workers.dev" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://resource.zigbang.io" />
      <link rel="dns-prefetch" href="https://d4k1brqee4emz.cloudfront.net" />
      <link rel="dns-prefetch" href="https://wishes-image-proxy.wishes-img.workers.dev" />
      {children}
    </>
  );
}
