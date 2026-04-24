'use client';

interface BuildingRegistryProps {
  listing: any;
}

export default function BuildingRegistry({ listing }: BuildingRegistryProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-700 mb-2">건축물대장</h3>
      <p className="text-sm text-gray-500">건축물대장 정보를 불러오는 중...</p>
    </div>
  );
}
