// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapControls — 지도 우상단 레이어 토글 (통근 등고선 / 히트맵 / 3D)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Clock, Flame, Box, Link2 } from 'lucide-react';
import { useMap2026Store } from '../store';

export function MapControls() {
  const { isochrone, heatmap, threeD, similar } = useMap2026Store();
  const toggleLayer = useMap2026Store((s) => s.toggleLayer);

  const items = [
    { key: 'isochrone' as const, active: isochrone, icon: Clock, label: '통근' },
    { key: 'heatmap' as const,   active: heatmap,   icon: Flame, label: '히트' },
    { key: 'threeD' as const,    active: threeD,    icon: Box,   label: '3D' },
    { key: 'similar' as const,   active: similar,   icon: Link2, label: '유사' },
  ];

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-md">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            onClick={() => toggleLayer(it.key)}
            className={[
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition',
              it.active
                ? 'bg-emerald-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-50',
            ].join(' ')}
          >
            <Icon className="size-3.5" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
