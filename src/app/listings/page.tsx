import type { Metadata } from 'next';
import ListingsClient from './ListingsClient';

export const metadata: Metadata = {
  title: '매물검색 - 서울·경기 전세 월세 매매',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가 매물을 검색하세요. 전세, 월세, 매매 매물을 지역별로 필터링하여 찾아보세요.',
  alternates: {
    canonical: 'https://wishes.co.kr/listings',
  },
  openGraph: {
    title: '매물검색 - WISHES',
    description: '서울·경기 부동산 매물을 쉽게 검색하세요.',
    url: 'https://wishes.co.kr/listings',
  },
};

export default function ListingsPage() {
  return <ListingsClient />;
}
