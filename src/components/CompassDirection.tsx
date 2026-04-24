'use client';

interface CompassDirectionProps {
  direction?: string | null;
}

const DIRECTION_MAP: Record<string, number> = {
  '북': 0,
  '북동': 45,
  '동': 90,
  '남동': 135,
  '남': 180,
  '남서': 225,
  '서': 270,
  '북서': 315,
  '북향': 0,
  '북동향': 45,
  '동향': 90,
  '남동향': 135,
  '남향': 180,
  '남서향': 225,
  '서향': 270,
  '북서향': 315,
};

export default function CompassDirection({ direction }: CompassDirectionProps) {
  if (!direction) return null;

  const deg = DIRECTION_MAP[direction] ?? null;
  if (deg === null) return <span className="text-xs text-gray-500">{direction}</span>;

  return (
    <div className="inline-flex items-center gap-1" title={direction}>
      <div className="relative w-6 h-6">
        <div className="absolute inset-0 rounded-full border border-gray-300 bg-white" />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${deg}deg)` }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L9 6H5L7 1Z" fill="#EF4444" />
            <path d="M7 13L5 8H9L7 13Z" fill="#9CA3AF" />
          </svg>
        </div>
      </div>
      <span className="text-xs text-gray-600">{direction}</span>
    </div>
  );
}
