'use client';

import dynamic from 'next/dynamic';
import { Building2 } from 'lucide-react';

const ImageGallery = dynamic(() => import('./ImageGallery'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
      <div className="aspect-[16/10] bg-gray-100 flex flex-col items-center justify-center text-gray-400">
        <Building2 className="w-16 h-16 mb-2 animate-pulse" />
        <p className="text-sm">이미지 로딩 중...</p>
      </div>
    </div>
  ),
});

interface DynamicImageGalleryProps {
  images: { id: number; url: string; alt: string | null }[];
  title: string;
  deal: string;
  status: string;
  dealColor: string;
  statusColor: string;
}

export default function DynamicImageGallery(props: DynamicImageGalleryProps) {
  return <ImageGallery {...props} />;
}
