import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ConditionalLayout } from '@/components/ConditionalLayout';

export const metadata: Metadata = {
  metadataBase: new URL('https://wishes.co.kr'),
  manifest: '/manifest.json',
  title: {
    default: 'WISHES | 서울·경기 종합부동산 서비스',
    template: '%s | WISHES',
  },
  description:
    '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트 종합부동산 중개. 전세, 월세, 매매 매물을 지도에서 쉽게 찾아보세요.',
  keywords: [
    '서울 부동산', '경기 부동산', '원룸 전세', '월세 매물',
    '오피스텔', '아파트 매매', 'WISHES', '종합부동산',
    '관악구 부동산', '신림동 원룸', '전세대출 상담',
  ],
  openGraph: {
    title: 'WISHES | 서울·경기 종합부동산',
    description: '서울·경기 전 지역 종합부동산. 지도로 매물을 쉽게 찾아보세요.',
    url: 'https://wishes.co.kr',
    siteName: 'WISHES',
    locale: 'ko_KR',
    type: 'website',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'WISHES - 서울·경기 종합부동산',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WISHES | 서울·경기 종합부동산',
    description: '서울·경기 전 지역 종합부동산 서비스.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
    other: {
      'naver-site-verification': '924ead2b53885a0168f7b41745852535ac11f7b8',
    },
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
        <meta charSet="utf-8" />
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* ⚡ 카카오맵 CDN 사전 연결 — TLS 핸드셰이크 비용 제거 */}
        <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="" />
        <link rel="preconnect" href="https://t1.daumcdn.net" crossOrigin="" />
        <link rel="preconnect" href="https://map.daumcdn.net" crossOrigin="" />
        <link rel="preconnect" href="https://mts.daumcdn.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://rv.map.daum.net" />
        <link rel="dns-prefetch" href="https://map0.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map1.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map2.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map3.daumcdn.net" />

        {/* ⚡ 카카오맵 SDK — 핵심(services + clusterer) 만 선로드, drawing 은 사용자가 그리기 버튼 클릭 시 lazy 로드 */}
        <Script
          src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || 'a1c65d0ec2ecc8d2d231f8558f896e38'}&libraries=services,clusterer&autoload=false`}
          strategy="beforeInteractive"
        />

        {/* Google Analytics removed - not configured */}

        {/* Naver Analytics */}
        <Script id="naver-analytics" strategy="afterInteractive">
          {`
            var _hmt = _hmt || [];
            (function() {
              var hm = document.createElement("script");
              hm.src = "https://wcs.naver.net/wcslog.js";
              var s = document.getElementsByTagName("script")[0];
              s.parentNode.insertBefore(hm, s);
            })();
            if (window.wcs) {
              window.wcs.inflow("wishes.co.kr");
            }
          `}
        </Script>

        {/* JSON-LD LocalBusiness */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'RealEstateAgent',
              name: 'WISHES',
              url: 'https://wishes.co.kr',
              email: 'wishes@wishes.co.kr',
              sameAs: 'https://wishes.co.kr',
              address: {
                '@type': 'PostalAddress',
                streetAddress: '신림로64길 23, 8층',
                addressLocality: '관악구',
                addressRegion: '서울특별시',
                postalCode: '08776',
                addressCountry: 'KR',
              },
              geo: {
                '@type': 'GeoCoordinates',
                latitude: 37.4847,
                longitude: 126.9293,
              },
              openingHours: 'Mo-Fr 09:00-19:00',
              areaServed: {
                '@type': 'State',
                name: '서울특별시 및 경기도',
              },
            }),
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-wishes-bg text-wishes-text min-h-screen flex flex-col"
      >
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
