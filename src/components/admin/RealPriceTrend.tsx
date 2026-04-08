'use client';

interface RealPriceTrendProps {
  listingId: string;
  dealType?: string;
  dong?: string;
}

export default function RealPriceTrend({ listingId, dealType, dong }: RealPriceTrendProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-700 mb-2">실거래가 동향</h3>
      <p className="text-sm text-gray-500">매물 ID: {listingId}</p>
      {dealType && <p className="text-sm text-gray-500">거래유형: {dealType}</p>}
      {dong && <p className="text-sm text-gray-500">지역: {dong}</p>}
    </div>
  );
}
