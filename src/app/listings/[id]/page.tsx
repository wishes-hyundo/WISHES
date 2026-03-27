import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary">
            <ArrowLeft className="w-4 h-4" />
            매물 목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">테스트 매물 {id}</span>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">네비게이션 테스트 페이지</h1>
        <p className="mt-4 text-gray-600">이 페이지는 네비게이션 테스트용입니다. ID: {id}</p>
        <div className="mt-8 flex gap-4">
          <Link href="/listings" className="px-4 py-2 bg-wishes-primary text-white rounded-lg">매물 목록으로</Link>
          <Link href="/about" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">회사소개</Link>
          <Link href="/" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">홈으로</Link>
        </div>
      </div>
    </div>
  );
}
