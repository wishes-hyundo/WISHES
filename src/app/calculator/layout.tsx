import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '부동산 계산기 - 중개수수료·취득세·대출이자 계산',
    description: '부동산 중개수수료, 취득세, 대출이자를 간편하게 계산하세요. 서울·경기 부동산 거래 시 필요한 각종 비용을 정확하게 산출해드립니다. WISHES 부동산 계산기',
    keywords: ['부동산 계산기', '중개수수료 계산', '취득세 계산', '대출이자 계산', '부동산 비용', '서울 부동산'],
    alternates: {
        canonical: 'https://wishes.co.kr/calculator',
    },
    openGraph: {
        title: '부동산 계산기 | WISHES',
        description: '중개수수료·취득세·대출이자를 간편하게 계산하세요.',
        url: 'https://wishes.co.kr/calculator',
        siteName: 'WISHES - 서울·경기 종합부동산',
        type: 'website',
        locale: 'ko_KR',
    },
};

export default function CalculatorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
