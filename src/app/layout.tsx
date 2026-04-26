import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { ConditionalLayout } from '@/components/ConditionalLayout';
import QueryProvider from '@/components/providers/QueryProvider';
import SpeculationRules from '@/components/SpeculationRules';
import WebVitalsReporter from '@/components/WebVitalsReporter';

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
  alternates: {
    canonical: '/',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
    other: {
      'naver-site-verification': '924ead2b53885a0168f7b41745852535ac11f7b8',
    },
  },
};

/**
 * L-viewport1 (2026-04-22): Next.js 15 는 viewport·themeColor·colorScheme 을
 * metadata 객체에서 분리해 별도 `export const viewport` 로 이동해야 경고 없이
 * 동작. manifest.json 의 theme_color(#3a7d44) 와 일치시켜 PWA 스플래시·주소창
 * 색상이 브랜드 그린으로 렌더되도록 지정.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#3a7d44',
  colorScheme: 'light',
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

        {/* ⚡ 카카오맵 CDN 사전 연결 — TLS 핸드셰이크 비용 제거 */}
        <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="" />
        <link rel="preconnect" href="https://t1.daumcdn.net" crossOrigin="" />
        <link rel="preconnect" href="https://map.daumcdn.net" crossOrigin="" />
        <link rel="preconnect" href="https://mts.daumcdn.net" crossOrigin="" />
        {/* L2 (2026-04-21): Pretendard / GmarketSans 폰트가 jsdelivr 로부터 로드되므로
            preconnect 로 TLS 핸드셰이크 1RTT 를 제거.
            crossOrigin="anonymous" 는 필수 — 폰트 요청은 CORS 모드라 matching
            anonymous preconnect 만 재사용됨 (없으면 중복 connection 생성). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />

        {/* L-perf1 (2026-04-21): Pretendard CSS 를 <link> 로 병렬 로드. 이전에는
            globals.css 안의 @import 로 직렬 체인됐어서 Lighthouse 가 render-blocking
            170ms 로 지적. <link> 는 HTML 파서가 조기에 발견해 다른 리소스와 병렬 페치. */}
        {/* L-cls1 (2026-04-21): L-perf2 non-blocking 패턴 rollback.
            media=print + swap 방식은 render-blocking 130ms 를 제거했지만, first paint
            가 시스템 폰트로 이뤄진 뒤 Pretendard 가 나중에 swap 되면서 메트릭 차이로
            히어로 섹션에서 CLS 0.234 발생 → Performance 90 → 85 로 후퇴.
            LCP 는 L-perf3 (fade-in 제거) 효과 로 1.7s → 0.74s 까지 내려왔기 때문에
            블로킹 CSS 130ms 를 다시 수용해도 LCP 예산 충분. 단순 <link rel="stylesheet">
            로 복귀해 첫 paint 에서 이미 Pretendard 적용 → CLS 제거. */}
        {/* L-sec99 (2026-04-22): SRI integrity 추가.
            jsdelivr CDN 공급망 공격 시 임의 CSS 주입 차단 (attribute selector 로
            폼 값 exfiltrate, @font-face unicode-range trick 등). hash 은 pinned tag
            v1.3.9 기준 sha384. 업그레이드 시 hash 재계산 필요. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          integrity="sha384-GIdEBaqGN9mNkDkMkzMHW8EKUqtpPIe/sLj1X7DIrnc9uPtLROJgmuDlh+3rBw0j"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://rv.map.daum.net" />
        <link rel="dns-prefetch" href="https://map0.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map1.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map2.daumcdn.net" />
        <link rel="dns-prefetch" href="https://map3.daumcdn.net" />

        {/* ⚡ 카카오맵 SDK — 핵심(services + clusterer) 만 선로드, drawing 은 사용자가 그리기 버튼 클릭 시 lazy 로드 */}
        {/* L-perf5 (2026-04-22): beforeInteractive → afterInteractive. */}
        {/*   홈·어박트·계산기·블로그 등 대부분 페이지는 Kakao SDK 가 필요없음. */}
        {/*   beforeInteractive 는 하이드레이션을 지연시켜 TTI 를 악화시킴. afterInteractive 로 */}
        {/*   하이드레이션 이후 병렬 로드. /map · /listings/[id] 은 MapClient/ListingLocationMap 가 */}
        {/*   추가 로드 시도 전에 window.kakao?.maps 체크로 따라잡음(중복 스크립트 방지). */}
        <Script
          id="kakao-map-sdk"
          src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || 'a1c65d0ec2ecc8d2d231f8558f896e38'}&libraries=services,clusterer&autoload=false`}
          strategy="afterInteractive"
        />

        {/* Google Analytics removed - not configured */}

        {/* Naver Analytics removed - CDN 503 issue */}

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
        <SpeculationRules />
        <WebVitalsReporter />
        <QueryProvider>
          <ConditionalLayout>
            {children}
          </ConditionalLayout>
        </QueryProvider>
      </body>
    </html>
  );
}
