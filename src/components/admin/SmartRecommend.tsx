'use client';

interface SmartRecommendProps {
  currentListing: any;
  onSelect?: (rec: any) => void;
}

export default function SmartRecommend({ currentListing, onSelect }: SmartRecommendProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-700 mb-2">스마트 추천</h3>
      <p className="text-sm text-gray-500">추천 매물을 분석 중...</p>
    </div>
  );
}
