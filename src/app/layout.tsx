import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';

export const metadata: Metadata = {
  title: {
    default: '위시스부동산 | 서울 관악구 전문 부동산',
    template: '%s | 위시스부동산',
  },
  description: '서울 관악구 신림동·봉천동 원룸, 투룸, 오피스텔, 아파트 전문 부동산. 전세, 월세, 매매 매물을 지도에서 쉽게 찾아보세요.',
  keywords: ['부동산', '관악구', '신림동', '봉천동', '원룸', '전세', '월세', '매매', '오피스텔', '위시스'],
  openGraph: {
    title: '위시스부동산 | 서울 관악구 전문 부동산',
    description: '서울 관악구 신림동·봉천동 전문 부동산. 지도로 매물을 쉽게 찾아보세요.',
    url: 'https://wishes.co.kr',
    siteName: '위시스부동산',
    locale: 'ko_KR',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 카카오맵 SDK */}
        <Script
          src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=services,clusterer&autoload=false`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-wishes-bg text-wishes-text min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <FloatingButtons />
      </body>
    </html>
  );
}
