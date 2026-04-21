import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '매물 비교',
  description: '관심 매물을 나란히 비교해보세요. 가격·면적·층·옵션·입주일 등 주요 조건을 한 번에 비교할 수 있습니다.',
  keywords: ['매물 비교', '부동산 비교', '원룸 비교', '전세 비교', '월세 비교', 'WISHES'],
  openGraph: {
    title: '매물 비교 | WISHES',
    description: '관심 매물을 나란히 비교. 가격·면적·옵션까지 한눈에.',
    url: 'https://wishes.co.kr/compare',
    siteName: 'WISHES',
    type: 'website',
  },
  alternates: {
    canonical: 'https://wishes.co.kr/compare',
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
