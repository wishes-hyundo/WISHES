// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListPanel — 좌측 매물 리스트 (정렬 적용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo } from 'react';
import { MapPin, Image as ImageIcon } from 'lucide-react';
import { useMap2026Store, type MapListing, type SortKey } from '../store';
import { formatDealLabel, formatDeviation, formatArea, formatStationDistance } from '../lib/priceFormat';
import { SortMenu } from './SortMenu';

function sortListings(list: MapListing[], sort: SortKey): MapListing[] {
  const copy = [...list];
  switch (sort) {
    case 'recent':
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
    case 'price_asc':
      copy.sort(
        (a, b) =>
          (a.price ?? a.deposit ?? a.monthly ?? Number.MAX_SAFE_INTEGER) -
          (b.price ?? b.deposit ?? b.monthly ?? Number.MAX_SAFE_INTEGER)
      );
      break;
    case 'price_desc':
      copy.sort(
        (a, b) =>
          (b.price ?? b.deposit ?? b.monthly ?? -1) -
          (a.price ?? a.deposit ?? a.monthly ?? -1)
      );
      break;
    case 'area_desc':
      copy.sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
      break;
    case 'deal_score':
      copy.sort((a, b) => (b.hero_score ?? 0) - (a.hero_score ?? 0));
      break;
  }
  return copy;
}

export function ListPanel() {
  const listings = useMap2026Store((s) => s.listings);
  const loading = useMap2026Store((s) => s.loading);
  const sort = useMap2026Store((s) => s.sort);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const selectListing = useMap2026Store((s) => s.selectListing);

  const sorted = useMemo(() => sortListings(listings, sort), [listings, sort]);

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-bold text-neutral-900">
            {loading ? '검색 중…' : `${sorted.length.toLocaleString()}개`}
          </span>
          <span className="text-[11.5px] text-neutral-500">매물</span>
        </div>
        <SortMenu />
      </header>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-neutral-400">
            <MapPin className="size-8 opacity-50" />
            <div className="text-[13px]">이 영역에 매물이 없습니다</div>
            <div className="text-[11.5px]">지도를 움직이거나 필터를 조정해 보세요</div>
          </div>
        )}
        {sorted.map((l) => {
          const dev = formatDeviation(l.median_deviation);
          const station = formatStationDistance(l.station_distance);
          const active = selectedId === l.id;
          return (
            <button
              key={l.id}
              onClick={() => selectListing(l.id, true)}
              className={[
                'block w-full border-b border-neutral-50 px-4 py-3 text-left transition',
                active ? 'bg-emerald-50' : 'hover:bg-neutral-50',
              ].join(' ')}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white">
                  {l.deal}
                </span>
                {l.type && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700">
                    {l.type}
                  </span>
                )}
                {dev.kind !== 'neutral' && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      dev.kind === 'good'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700',
                    ].join(' ')}
                  >
                    {dev.text}
                  </span>
                )}
                {l.photo_count > 0 && (
                  <span className="ml-auto flex items-center gap-0.5 text-[10px] text-neutral-400">
                    <ImageIcon className="size-3" />
                    {l.photo_count}
                  </span>
                )}
              </div>
              <div className="text-[15px] font-bold leading-tight text-neutral-900">
                {formatDealLabel(l)}
              </div>
              <div className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
                {l.title ?? l.building_name ?? l.dong ?? '-'}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11.5px] text-neutral-600">
                <span>{formatArea(l.area_m2)}</span>
                <span className="text-neutral-300">·</span>
                <span>{l.floor_current ?? '-'}</span>
                {station && (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span className="text-emerald-700">{station}</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
