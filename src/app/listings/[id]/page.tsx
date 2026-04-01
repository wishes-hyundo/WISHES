import type { Metadata } from 'next';
import ListingDetailClient from './ListingDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Metadata는 가볍게 생성 (클라이언트에서 데이터 로드하므로 기본값)
  const { id } = await params;
  return {
    title: `매물 상세 #${id}`,
    description: '서울·경기 부동산 매물 상세 정보',
  };
}

// 정적 shell + 클라이언트 데이터 페칭 → 즉시 로드
export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
