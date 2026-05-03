import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description: 'WISHES 이용 관련 자주 묻는 질문. 중개 절차, 계약, 수수료, 매물 문의 방법 등 궁금한 점을 확인해보세요.',
  keywords: ['부동산 FAQ', '중개 절차', '계약 방법', '부동산 수수료', 'WISHES 문의'],
  openGraph: {
    title: '자주 묻는 질문 | WISHES',
    description: '중개 절차·계약·수수료·매물 문의 방법까지 한눈에.',
    url: 'https://wishes.co.kr/faq',
    siteName: 'WISHES',
    type: 'website',
    locale: 'ko_KR',
    // G-64 (2026-05-03): og:image 추가.
    images: [{ url: 'https://wishes.co.kr/og-image.png', width: 1200, height: 630, alt: 'WISHES FAQ' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://wishes.co.kr/og-image.png'] },
  alternates: {
    canonical: 'https://wishes.co.kr/faq',
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
