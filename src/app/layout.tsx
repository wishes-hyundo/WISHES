import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ConditionalLayout } from '@/components/ConditionalLayout';
import ImageProtection from '@/components/ImageProtection';

export const metadata: Metadata = {
  metadataBase: new URL('https://wishes.co.kr'),
  title: {
    default: 'ììì¤ë¶ëì° | ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤',
    template: '%s | ììì¤ë¶ëì°',
  },
  description: 'ìì¸Â·ê²½ê¸° ì  ì§ì­ ìë£¸, í¬ë£¸, ì¤í¼ì¤í, ìíí¸ ì¢í©ë¶ëì° ì¤ê°. ì ì¸, ìì¸, ë§¤ë§¤ ë§¤ë¬¼ì ì§ëìì ì½ê² ì°¾ìë³´ì¸ì.',
  keywords: ['ìì¸ ë¶ëì°', 'ê²½ê¸° ë¶ëì°', 'ìë£¸ ì ì¸', 'ìì¸ ë§¤ë¬¼', 'ì¤í¼ì¤í', 'ìíí¸ ë§¤ë§¤', 'ììì¤ë¶ëì°', 'ì¢í©ë¶ëì°'],
  openGraph: {
    title: 'ììì¤ë¶ëì° | ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì°',
    description: 'ìì¸Â·ê²½ê¸° ì  ì§ì­ ì¢í©ë¶ëì°. ì§ëë¡ ë§¤ë¬¼ì ì½ê² ì°¾ìë³´ì¸ì.',
    url: 'https://wishes.co.kr',
    siteName: 'ììì¤ë¶ëì°',
    locale: 'ko_KR',
    type: 'website',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'ììì¤ë¶ëì° - ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì°',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ììì¤ë¶ëì° | ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì°',
    description: 'ìì¸Â·ê²½ê¸° ì  ì§ì­ ì¢í©ë¶ëì° ìë¹ì¤. 1533-9580',
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

        {/* ì¹´ì¹´ì¤ë§´ SDK */}
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
              name: 'ììì¤ë¶ëì°ì¤ê°ë²ì¸',
              url: 'https://wishes.co.kr',
              
              email: 'wishes@wishes.co.kr',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'ì ë¦¼ë¡64ê¸¸ 23, 8ì¸µ',
                addressLocality: 'ê´ìêµ¬',
                addressRegion: 'ìì¸í¹ë³ì',
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
                name: 'ìì¸í¹ë³ì ë° ê²½ê¸°ë',
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
