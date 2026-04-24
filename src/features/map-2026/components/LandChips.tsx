// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LandChips — 🌾 토지 탭 전용 칩
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Row A: 지목 멀티 선택 (대지·전·답·임야·잡종지)
// Row B: 특화 (도로접함·지목변경·개발가능)
// 테마: lime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Map, Route, Shuffle, Hammer } from 'lucide-react';
import { useMap2026Store } from '../store';

const LAND_TYPES = ['대지', '전', '답', '임야', '잡종지'] as const;

export function LandChips() {
  const filter = useMap2026Store((s) => s.filter);
  const togglePropertyType = useMap2026Store((s) => s.togglePropertyType);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);

  const hasRoadAccess = filter.features.includes('도로접함');
  const hasZoneChangeable = filter.features.includes('지목변경가능');
  const hasDevelopable = filter.features.includes('개발가능');

  return (
    <div className="flex flex-col gap-2">
      {/* Row A — 지목 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-neutral-500">지목</span>
        {LAND_TYPES.map((t) => {
          const active = filter.propertyTypes.includes(t);
          return (
            <button
              key={t}
              onClick={() => togglePropertyType(t)}
              className={landTypeChipClass(active)}
            >
              <Map className="size-3.5" />
              {t}
            </button>
          );
        })}
      </div>

      {/* Row B — 특화 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => toggleFeature('도로접함')}
          className={chipClass(hasRoadAccess)}
          title="도로와 접한 토지"
        >
          <Route className="size-3.5" />
          도로접함
        </button>

        <button
          onClick={() => toggleFeature('지목변경가능')}
          className={chipClass(hasZoneChangeable)}
          title="지목 변경 가능 토지"
        >
          <Shuffle className="size-3.5" />
          지목변경
        </button>

        <button
          onClick={() => toggleFeature('개발가능')}
          className={chipClass(hasDevelopable)}
          title="개발·건축 가능 토지"
        >
          <Hammer className="size-3.5" />
          개발가능
        </button>
      </div>
    </div>
  );
}

function landTypeChipClass(active: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
    active
      ? 'bg-lime-600 text-white shadow-sm'
      : 'bg-lime-50 text-lime-800 ring-1 ring-lime-200 hover:bg-lime-100',
  ].join(' ');
}

function chipClass(active: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
    active
      ? 'bg-lime-600 text-white shadow-sm'
      : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
  ].join(' ');
}
