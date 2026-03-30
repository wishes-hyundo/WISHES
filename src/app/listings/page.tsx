import type { Metadata } from 'next';
import ListingsClient from './ListingsClient';

export const metadata: Metadata = {
  title: '매물검색',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔 매물을 검색하세요.',
};

export default function ListingsPage() {
  return <ListingsClient />;
}
