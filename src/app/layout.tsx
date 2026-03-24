import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';

export const metadata: Metadata = {
  metadataBase: new URL('https://wishes.co.kr'),
  title: {
    default: 'ììì¤ë¶ëì° | ìì¸ ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì ë¬¸ ë¶ëì°',
    template: '%s | ììì¤ë¶ëì°',
  },
  description: 'ìì¸ ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ìë£¸, í¬ë£¸, ì¤í¼ì¤í, ìíí¸ ì ë¬¸ ë¶ëì° ì¤ê°. ì ì¸, ìì¸, ë§¤ë§¤ ë§¤ë¬¼ì ì§ëìì ì½ê² ì°¾ìë³´ì¸ì. ì íìë´ 1533-9580',
  keywords: ['ê´ìêµ¬ ë¶ëì°', 'ì ë¦¼ë ìë£¸', 'ë´ì²ë ì ì¸', 'ì ë¦¼ì­ ìì¸', 'ê´ìêµ¬ ì¤í¼ì¤í', 'ìì¸ëìêµ¬ ë¶ëì°', 'ììì¤ë¶ëì°', 'ê´ìêµ¬ ë§¤ë§¤'],
  openGraph: {
    title: 'ììì¤ë¶ëì° | ìì¸ ê´ìêµ¬ ì ë¬¸ ë¶ëì°',
    description: 'ìì¸ ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì ë¬¸ ë¶ëì°. ì§ëë¡ ë§¤ë¬¼ì ì½ê² ì°¾ìë³´ì¸ì. 1533-9580',
    url: 'https://wishes.co.kr',
    siteName: 'ììì¤ë¶ëì°',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ììì¤ë¶ëì° - ìì¸ ê´ìêµ¬ ì ë¬¸' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ììì¤ë¶ëì° | ìì¸ ê´ìêµ¬ ì ë¬¸ ë¶ëì°',
    description: 'ìì¸ ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì ë¬¸ ë¶ëì°. 1533-9580',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://wishes.co.kr' },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  verification: {
    google: 'KeMqGIqWkHLW4B4G-SVYbsJsWx_Nmn3e3WbP4_3cpiI',
    other: { 'naver-site-verification': 'NAVER_VERIFICATION_CODE' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Script src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=services,clusterer&autoload=false`} strategy="beforeInteractive" />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-1Z8HW2JVPV" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('consent', 'default', { analytics_storage: 'granted' });
          gtag('config', 'G-1Z8HW2JVPV');
        `}</Script>
        <Script id="naver-analytics" strategy="afterInteractive">{`
          var _hmt = _hmt || [];
          (function() {
            var hm = document.createElement("script");
            hm.src = "https://wcs.naver.net/wcslog.js";
            var s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(hm, s);
          })();
          if (window.wcs) { window.wcs.inflow("wishes.co.kr"); }
        `}</Script>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'RealEstateAgent',
          name: 'ììì¤ë¶ëì°ì¤ê°ë²ì¸', url: 'https://wishes.co.kr',
          telephone: '1533-9580', email: 'wishes@wishes.co.kr',
          address: { '@type': 'PostalAddress', streetAddress: 'ì ë¦¼ë¡64ê¸¸ 23, 8ì¸µ', addressLocality: 'ê´ìêµ¬', addressRegion: 'ìì¸í¹ë³ì', postalCode: '08776', addressCountry: 'KR' },
          geo: { '@type': 'GeoCoordinates', latitude: 37.4847, longitude: 126.9293 },
          openingHours: 'Mo-Fr 09:00-19:00',
          areaServed: { '@type': 'City', name: 'ìì¸í¹ë³ì ê´ìêµ¬' },
        }) }} />
      </head>
      <body className="bg-wishes-bg text-wishes-text min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingButtons />
      </body>
    </html>
  );
}
