import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ConditionalLayout } from '@/components/ConditionalLayout';
import ImageProtection from '@/components/ImageProtection';

export const metadata: Metadata = {
  metadataBase: new URL('https://wishes.co.kr'),
  title: {
    default: '위시스부동산 | 서울·경기 종합부동산 서비스',
    template: '%s | 위시스부동산',
  },
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트 종합부동산 중개. 전세, 월세, 매매 매물을 지도에서 쉽게 찾아보세요.',
  keywords: ['서울 부동산', '경기 부동산', '원룸 전세', '월세 매물', '오피스텔', '아파트 매매', '위시스부동산', '종합부동산'],
  openGraph: {
    title: '위시스부동산 | 서울·경기 종합부동산',
    description: '서울·경기 전 지역 종합부동산. 지도로 매물을 쉽게 찾아보세요.',
    url: 'https://wishes.co.kr',
    siteName: '위시스부동산',
    locale: 'ko_KR',
    type: 'website',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: '위시스부동산 - 서울·경기 종합부동산',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '위시스부동산 | 서울·경기 종합부동산',
    description: '서울·경기 전 지역 종합부동산 서비스. 1533-9580',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://wishes.co.kr',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'GOOGLE_VERIFICATION_CODE',
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
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* 카카오맵 SDK */}
        <Script
          src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=services,clusterer&autoload=false`}
          strategy="beforeInteractive"
        />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('consent', 'default', {
              analytics_storage: 'granted'
            });
            gtag('config', 'G-XXXXXXXXXX');
          `}
        </Script>

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
              name: '위시스부동산중개법인',
              url: 'https://wishes.co.kr',
              telephone: '1533-9580',
              email: 'wishes@wishes.co.kr',
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
      <body className="bg-wishes-bg text-wishes-text min-h-screen flex flex-col">
        <ImageProtection />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
