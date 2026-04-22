import type { Metadata } from 'next';

// L-sec129 (2026-04-22, M-2): /compare 는 사용자가 localStorage 에 담아둔 비교
//   목록을 기반으로 랜더링되는 세션 상태 페이지. 공용 canonical content 가 아니며,
//   GSC 에서도 실질 콘텐츠가 없는 페이지로 취급돼 인덱스 품질을 떨어뜨림.
//   /search 와 동일하게 robots: { index: false } 로 크롤 차단.
export const metadata: Metadata = {
  title: '매물 비교',
  description: '관심 매물을 나란히 비교해보세요. 가격·면적·층·옵션·입주일 등 주요 조건을 한 번에 비교할 수 있습니다.',
  keywords: ['매물 비교', '부동산 비교', '원룸 비교', '전세 비교', '월세 비교', 'WISHES'],
  robots: {
    index: false,
    follow: true,
  },
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
