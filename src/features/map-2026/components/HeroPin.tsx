// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero Pin — 선별된 매물만 표시되는 가격 핀 (HTML/Absolute)
// 비교우위 배지(±%) + 선택 시 강조
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMap2026Store, type MapListing } from '../store';
import { formatDealLabel, formatDeviation } from '../lib/priceFormat';

interface Props {
  map: MapLibreMap;
  listing: MapListing;
}

export function HeroPin({ map, listing }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const selectListing = useMap2026Store((s) => s.selectListing);
  const setHover = useMap2026Store((s) => s.setHover);

  useEffect(() => {
    const update = () => {
      const p = map.project([listing.lng, listing.lat]);
      setPos({ x: p.x, y: p.y });
    };
    update();
    map.on('move', update);
    map.on('zoom', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [map, listing.lng, listing.lat]);

  if (!pos) return null;

  const dev = formatDeviation(listing.median_deviation);
  const isSelected = selectedId === listing.id;

  return (
    <button
      onClick={() => selectListing(listing.id, true)}
      onMouseEnter={(e) => setHover(listing, e.clientX, e.clientY)}
      onMouseLeave={() => setHover(null)}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
        zIndex: isSelected ? 30 : 10,
      }}
      className={[
        'group pointer-events-auto flex flex-col items-center',
        'transition-transform will-change-transform',
        isSelected ? 'scale-110' : 'hover:scale-105',
      ].join(' ')}
    >
      <div
        className={[
          'relative rounded-full px-2.5 py-1 text-[12px] font-bold shadow-md',
          'border-2 border-white',
          isSelected
            ? 'bg-neutral-900 text-white'
            : dev.kind === 'good'
              ? 'bg-emerald-600 text-white'
              : dev.kind === 'bad'
                ? 'bg-rose-500 text-white'
                : 'bg-white text-neutral-900',
        ].join(' ')}
      >
        {formatDealLabel(listing)}
        {dev.kind !== 'neutral' && (
          <span
            className={[
              'absolute -top-1.5 -right-1.5 rounded-full px-1 py-0.5 text-[9px] font-bold shadow',
              dev.kind === 'good' ? 'bg-white text-emerald-700' : 'bg-white text-rose-700',
            ].join(' ')}
          >
            {dev.text}
          </span>
        )}
      </div>
      <div
        className={[
          'size-1.5 -mt-px rotate-45',
          isSelected ? 'bg-neutral-900' : dev.kind === 'good' ? 'bg-emerald-600' : dev.kind === 'bad' ? 'bg-rose-500' : 'bg-white',
        ].join(' ')}
      />
    </button>
  );
}
