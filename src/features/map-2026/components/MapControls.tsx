// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapControls — 지도 우상단 레이어 토글
//   · 통근(Isochrone): 켜면 분 선택 팝오버 노출, 선택된 매물 기준으로 동심원 생성
//   · 히트맵 / 3D / 유사
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Clock, Flame, Box, Link2 } from 'lucide-react';
import { useMap2026Store } from '../store';

const ISOCHRONE_MINUTES = [10, 15, 20, 30, 45];

export function MapControls() {
  const { isochrone, heatmap, threeD, similar } = useMap2026Store();
  const toggleLayer = useMap2026Store((s) => s.toggleLayer);
  const minutes = useMap2026Store((s) => s.isochroneMinutes);
  const setMinutes = useMap2026Store((s) => s.setIsochroneMinutes);
  const center = useMap2026Store((s) => s.isochroneCenter);
  const map = useMap2026Store((s) => s.map);
  const setCenter = useMap2026Store((s) => s.setIsochroneCenter);

  const items = [
    { key: 'isochrone' as const, active: isochrone, icon: Clock, label: '통근' },
    { key: 'heatmap' as const,   active: heatmap,   icon: Flame, label: '히트' },
    { key: 'threeD' as const,    active: threeD,    icon: Box,   label: '3D' },
    { key: 'similar' as const,   active: similar,   icon: Link2, label: '유사' },
  ];

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
      <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-md">
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

      {/* 통근 등고선 팝오버 */}
      {isochrone && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-white p-2 shadow-lg min-w-[180px]">
          <div className="text-[11px] font-bold text-emerald-700">
            통근 {minutes}분 이내
          </div>
          <div className="flex gap-1">
            {ISOCHRONE_MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className={[
                  'flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums transition',
                  m === minutes
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                ].join(' ')}
              >
                {m}분
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (!map) return;
              const c = map.getCenter();
              setCenter([c.lng, c.lat]);
            }}
            className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
          >
            현재 지도 중심으로 설정
          </button>
          {center && (
            <div className="text-[10px] text-neutral-500 tabular-nums">
              중심: {center[1].toFixed(4)}, {center[0].toFixed(4)}
            </div>
          )}
          {!center && (
            <div className="text-[10px] text-neutral-500">
              매물을 클릭하거나 버튼으로 기준점을 지정하세요
            </div>
          )}
        </div>
      )}
    </div>
  );
}
