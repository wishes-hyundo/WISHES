import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '상담·매물접수',
  description:
    'WISHES 부동산 상담·매물접수. 전국 17 시도 원룸·투룸·오피스텔·아파트, 전세·월세·매매 매물 상담을 받아보세요.',
  keywords: [
    '부동산 상담',
    '매물 접수',
    '전세 상담',
    '월세 상담',
    '매매 상담',
    '서울 부동산 상담',
    '경기 부동산 상담',
    'WISHES 상담',
  ],
  openGraph: {
    title: '상담·매물접수 | WISHES',
    description:
      '전국 17 시도 부동산 상담·매물접수. WISHES가 꼼꼼하게 도와드립니다.',
    url: 'https://wishes.co.kr/contact',
    siteName: 'WISHES',
    type: 'website',
  },
  alternates: {
    canonical: 'https://wishes.co.kr/contact',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
