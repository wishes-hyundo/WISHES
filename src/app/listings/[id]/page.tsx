import type { Metadata } from 'next';
import ListingDetailClient from './ListingDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `매물 상세 #${id}`,
    description: '서울·경기 부동산 매물 상세 정보',
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
