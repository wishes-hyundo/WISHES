import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FloatingButtons from '@/components/FloatingButtons';

export const metadata: Metadata = {
  title: {
    default: '위시스부동산중개법인 | 서울 관악구 신림동 전문 부동산',
    template: '%s | 위시스부동산',
  },
  description: '서울 관악구 신림동 전문 부동산 중개법인. 원룸, 투룸, 오피스텔, 아파트 전세·월세·매매. 15년 경력의 신뢰할 수 있는 중개서비스. 1533-9580',
  keywords: ['위시스부동산', '신림동부동산', '관악구부동산', '원룸', '투룸', '전세', '월세', '매매', '오피스텔', '서울대입구역'],
  openGraph: {
    title: '위시스부동산중개법인 | 서울 관악구 신림동 전문',
    description: '서울 관악구 신림동 전문 부동산 중개. 원룸/투룸/오피스텔/아파트 전세·월세·매매.',
    url: 'https://wishes.co.kr',
    siteName: '위시스부동산중개법인',
    locale: 'ko_KR',
    type: 'website',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://wishes.co.kr' },
  other: {
    'naver-site-verification': '', // 네이버 서치어드바이저 인증코드
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'RealEstateAgent',
              name: '위시스부동산중개법인',
              url: 'https://wishes.co.kr',
              telephone: '1533-9580',
              faxNumber: '02-888-8501',
              email: 'wishes@wishes.co.kr',
              address: {
                '@type': 'PostalAddress',
                streetAddress: '신림로64길 23, 8층(신림동)',
                addressLocality: '관악구',
                addressRegion: '서울특별시',
                postalCode: '08754',
                addressCountry: 'KR',
              },
              description: '서울 관악구 신림동 전문 부동산 중개법인',
              areaServed: { '@type': 'City', name: '서울특별시' },
            }),
          }}
        />
      </head>
      <body className="bg-gray-50 min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pt-16 sm:pt-[72px]">
          {children}
        </main>
        <Footer />
        <FloatingButtons />
      </body>
    </html>
  );
}
