// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero Pin — 선별된 매물만 보이는 가격 핀 (HTML/Absolute, 2026-04 업그레이드)
//
// 🎯 변경사항
//   - 카테고리 이모지 프리픽스 (🏠 🏢 🌾 💰)
//   - 시세편차 배지를 더 크게/읽기 쉽게 (▼12% / ▲7%)
//   - drop-shadow + 미세 bob 애니메이션
//   - selected 시 ring-2 outline + scale-[1.15]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMap2026Store, type MapListing, CATEGORY_THEME } from '../store';
import { formatDealLabel, formatDeviation } from '../lib/priceFormat';
import { focusListing } from '../lib/cinematicMotion';

interface Props {
  map: MapLibreMap;
  listing: MapListing;
}

export function HeroPin({ map, listing }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const category = useMap2026Store((s) => s.filter.category);
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
  const theme = CATEGORY_THEME[category];

  // 비교우위 화살표 (▼↓ 시세보다 쌈 / ▲↑ 비쌈)
  const arrow = dev.kind === 'good' ? '▼' : dev.kind === 'bad' ? '▲' : '·';
  const devText = dev.kind !== 'neutral' && listing.median_deviation != null ? `${arrow}${Math.round(Math.abs(listing.median_deviation * 100))}%` : null;

  return (
    <button
      onClick={() => {
        selectListing(listing.id, true);
        // Cinematic: 클릭 시 이 매물로 1:1 포커스 (zoom 16 + 건물 pitch)
        focusListing(map, [listing.lng, listing.lat]);
      }}
      onMouseEnter={(e) => setHover(listing, e.clientX, e.clientY)}
      onMouseLeave={() => setHover(null)}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
        zIndex: isSelected ? 30 : dev.kind === 'good' ? 20 : 10,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
      }}
      className={[
        'group pointer-events-auto flex flex-col items-center',
        'transition-transform duration-150 will-change-transform',
        isSelected ? 'scale-[1.15]' : 'hover:scale-110',
      ].join(' ')}
    >
      {/* 본체 — 가격 라벨 */}
      <div
        className={[
          'relative flex items-center gap-1 rounded-full border-2 border-white px-2.5 py-1',
          'text-[12px] font-bold tabular-nums tracking-tight',
          isSelected
            ? 'bg-neutral-900 text-white ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
            : dev.kind === 'good'
              ? 'bg-emerald-600 text-white'
              : dev.kind === 'bad'
                ? 'bg-rose-500 text-white'
                : `bg-white ${theme.text}`,
        ].join(' ')}
      >
        {/* 카테고리 이모지 */}
        <span className="text-[10px] leading-none">{theme.emoji}</span>
        {formatDealLabel(listing)}

        {/* 비교우위 배지 */}
        {devText && (
          <span
            className={[
              'ml-0.5 rounded-full px-1 py-0.5 text-[9.5px] font-bold leading-none',
              dev.kind === 'good' ? 'bg-white text-emerald-700' : 'bg-white text-rose-700',
            ].join(' ')}
          >
            {devText}
          </span>
        )}
      </div>

      {/* 아래 화살표 꼬리 */}
      <div
        className={[
          '-mt-px size-1.5 rotate-45',
          isSelected
            ? 'bg-neutral-900'
            : dev.kind === 'good'
              ? 'bg-emerald-600'
              : dev.kind === 'bad'
                ? 'bg-rose-500'
                : 'bg-white',
        ].join(' ')}
      />
    </button>
  );
}
