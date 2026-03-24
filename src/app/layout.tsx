import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';

export const metadata: Metadata = {
  metadataBase: new URL('https://wishes.co.kr'),
  title: {
    default: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ° | Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬ÂÂ Ã«Â¦Â¼Ã«ÂÂÃÂ·Ã«Â´ÂÃ¬Â²ÂÃ«ÂÂ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°',
    template: '%s | Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°',
  },
  description: 'Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬ÂÂ Ã«Â¦Â¼Ã«ÂÂÃÂ·Ã«Â´ÂÃ¬Â²ÂÃ«ÂÂ Ã¬ÂÂÃ«Â£Â¸, Ã­ÂÂ¬Ã«Â£Â¸, Ã¬ÂÂ¤Ã­ÂÂ¼Ã¬ÂÂ¤Ã­ÂÂ, Ã¬ÂÂÃ­ÂÂÃ­ÂÂ¸ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ° Ã¬Â¤ÂÃªÂ°Â. Ã¬Â ÂÃ¬ÂÂ¸, Ã¬ÂÂÃ¬ÂÂ¸, Ã«Â§Â¤Ã«Â§Â¤ Ã«Â§Â¤Ã«Â¬Â¼Ã¬ÂÂ Ã¬Â§ÂÃ«ÂÂÃ¬ÂÂÃ¬ÂÂ Ã¬ÂÂ½ÃªÂ²Â Ã¬Â°Â¾Ã¬ÂÂÃ«Â³Â´Ã¬ÂÂ¸Ã¬ÂÂ. Ã¬Â ÂÃ­ÂÂÃ¬ÂÂÃ«ÂÂ´ 1533-9580',
  keywords: ['ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°', 'Ã¬ÂÂ Ã«Â¦Â¼Ã«ÂÂ Ã¬ÂÂÃ«Â£Â¸', 'Ã«Â´ÂÃ¬Â²ÂÃ«ÂÂ Ã¬Â ÂÃ¬ÂÂ¸', 'Ã¬ÂÂ Ã«Â¦Â¼Ã¬ÂÂ­ Ã¬ÂÂÃ¬ÂÂ¸', 'ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬ÂÂ¤Ã­ÂÂ¼Ã¬ÂÂ¤Ã­ÂÂ', 'Ã¬ÂÂÃ¬ÂÂ¸Ã«ÂÂÃ¬ÂÂÃªÂµÂ¬ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°', 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°', 'ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã«Â§Â¤Ã«Â§Â¤'],
  openGraph: {
    title: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ° | Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°',
    description: 'Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬ÂÂ Ã«Â¦Â¼Ã«ÂÂÃÂ·Ã«Â´ÂÃ¬Â²ÂÃ«ÂÂ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°. Ã¬Â§ÂÃ«ÂÂÃ«Â¡Â Ã«Â§Â¤Ã«Â¬Â¼Ã¬ÂÂ Ã¬ÂÂ½ÃªÂ²Â Ã¬Â°Â¾Ã¬ÂÂÃ«Â³Â´Ã¬ÂÂ¸Ã¬ÂÂ. 1533-9580',
    url: 'https://wishes.co.kr',
    siteName: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ° - Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬Â ÂÃ«Â¬Â¸' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ° | Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°',
    description: 'Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬ Ã¬ÂÂ Ã«Â¦Â¼Ã«ÂÂÃÂ·Ã«Â´ÂÃ¬Â²ÂÃ«ÂÂ Ã¬Â ÂÃ«Â¬Â¸ Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°. 1533-9580',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://wishes.co.kr' },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  verification: {
    google: 'KeMqGIqWkHLW4B4G-SVYbsJsWx_Nmn3e3WbP4_3cpiI',
    other: { 'naver-site-verification': '924ead2b53885a0168f7b41745852535ac11f7b8' },
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
          name: 'Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¤Ã«Â¶ÂÃ«ÂÂÃ¬ÂÂ°Ã¬Â¤ÂÃªÂ°ÂÃ«Â²ÂÃ¬ÂÂ¸', url: 'https://wishes.co.kr',
          telephone: '1533-9580', email: 'wishes@wishes.co.kr',
          address: { '@type': 'PostalAddress', streetAddress: 'Ã¬ÂÂ Ã«Â¦Â¼Ã«Â¡Â64ÃªÂ¸Â¸ 23, 8Ã¬Â¸Âµ', addressLocality: 'ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬', addressRegion: 'Ã¬ÂÂÃ¬ÂÂ¸Ã­ÂÂ¹Ã«Â³ÂÃ¬ÂÂ', postalCode: '08776', addressCountry: 'KR' },
          geo: { '@type': 'GeoCoordinates', latitude: 37.4847, longitude: 126.9293 },
          openingHours: 'Mo-Fr 09:00-19:00',
          areaServed: { '@type': 'City', name: 'Ã¬ÂÂÃ¬ÂÂ¸Ã­ÂÂ¹Ã«Â³ÂÃ¬ÂÂ ÃªÂ´ÂÃ¬ÂÂÃªÂµÂ¬' },
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
