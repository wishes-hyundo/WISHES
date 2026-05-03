import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '지도검색 - 전국 부동산 지도',
  description: '전국 17 시도 부동산 매물을 지도에서 쉽게 찾아보세요. 원룸, 투룸, 오피스텔, 아파트, 상가 매물 위치 확인.',
  alternates: {
    canonical: 'https://wishes.co.kr/map',
  },
  openGraph: {
    // G-63 (2026-05-03): image/site_name/locale/type 추가 — 카카오톡 공유 미리보기 + SEO.
    type: 'website',
    title: '지도검색 - WISHES',
    description: '지도에서 부동산 매물을 찾아보세요.',
    url: 'https://wishes.co.kr/map',
    siteName: 'WISHES',
    locale: 'ko_KR',
    images: [
      {
        url: 'https://wishes.co.kr/og-image.png',
        width: 1200,
        height: 630,
        alt: 'WISHES 지도검색',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '지도검색 - WISHES',
    description: '지도에서 부동산 매물을 찾아보세요.',
    images: ['https://wishes.co.kr/og-image.png'],
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
