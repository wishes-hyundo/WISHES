import { Suspense } from 'react';
import type { Metadata } from 'next';
import ListingsClient from './ListingsClient';

export const metadata: Metadata = {
  title: '매물검색',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔 매물을 검색하세요.',
};

function ListingsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse mb-4" />
        <div className="flex gap-3">
          <div className="h-9 w-28 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
            <div className="h-48 bg-gray-200" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-6 bg-gray-200 rounded w-2/3" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ListingsPage() {
  return (
    <div className="pt-16 min-h-screen">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary">매물 검색</h1>
          <p className="text-sm text-gray-500 mt-1">원하시는 지역의 매물을 검색하세요</p>
        </div>
      </div>
      <Suspense fallback={<ListingsSkeleton />}>
        <ListingsClient />
      </Suspense>
    </div>
  );
}
