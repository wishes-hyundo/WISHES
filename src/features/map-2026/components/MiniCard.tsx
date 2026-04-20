// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MiniCard — hover 시 떠오르는 작은 카드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store } from '../store';
import { formatDealLabel, formatDeviation, formatArea, formatStationDistance } from '../lib/priceFormat';

export function MiniCard() {
  const listing = useMap2026Store((s) => s.hoveredListing);
  const pos = useMap2026Store((s) => s.hoverPos);

  if (!listing || !pos) return null;
  const dev = formatDeviation(listing.median_deviation);
  const station = formatStationDistance(listing.station_distance);

  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl"
      style={{
        left: pos.x + 12,
        top: pos.y + 12,
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white">
          {listing.deal}
        </span>
        {dev.kind !== 'neutral' && (
          <span
            className={[
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              dev.kind === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
            ].join(' ')}
          >
            시세 대비 {dev.text}
          </span>
        )}
      </div>
      <div className="text-[16px] font-bold leading-tight">
        {formatDealLabel(listing)}
      </div>
      <div className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
        {listing.title ?? listing.building_name ?? listing.dong ?? ''}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11.5px] text-neutral-600">
        <div>{formatArea(listing.area_m2)}</div>
        <div>{listing.floor_current ?? '-'}</div>
        {station && <div className="col-span-2 text-emerald-700">{station}</div>}
      </div>
    </div>
  );
}
