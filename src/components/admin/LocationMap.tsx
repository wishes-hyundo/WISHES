'use client';

interface LocationMapProps {
  address?: string;
  dong?: string;
  lat?: number;
  lng?: number;
}

export default function LocationMap({ address, dong, lat, lng }: LocationMapProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-700 mb-2">위치 정보</h3>
      <p className="text-sm text-gray-500">{address || dong || '주소 정보 없음'}</p>
      {lat && lng && (
        <p className="text-xs text-gray-400 mt-1">좌표: {lat.toFixed(4)}, {lng.toFixed(4)}</p>
      )}
    </div>
  );
}
