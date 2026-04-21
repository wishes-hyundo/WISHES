// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CommercialChips — 🏢 상가/사무실 탭 전용 칩
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 2단 구조
//   Row A: 세부 용도 (상가·사무실·지산·공유오피스·복합)  ← 멀티 선택
//   Row B: 특화 칩 (역세권·주차·엘리베이터·1층·코너·전용률↑)
//          Row A 선택에 따라 의미 없는 칩은 자동 디밍 (예측 디밍)
// 테마 색상: amber (CATEGORY_THEME.retail_office)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Train, Car, Building2, ArrowUpToLine, Square, Gauge } from 'lucide-react';
import {
  useMap2026Store,
  COMMERCIAL_PURPOSE_LABEL,
  type CommercialPurpose,
} from '../store';
import { slotStatus, type FilterSlot } from '../lib/filterVisibility';

const PURPOSE_ORDER: CommercialPurpose[] = [
  'retail', 'office', 'knowledge_center', 'coworking', 'mixed_use',
];

export function CommercialChips() {
  const filter = useMap2026Store((s) => s.filter);
  const togglePurpose = useMap2026Store((s) => s.togglePurpose);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);
  const setFilter = useMap2026Store((s) => s.setFilter);

  const stationActive = filter.nearStation != null;
  const hasParking = filter.features.includes('주차');
  const hasElevator = filter.features.includes('엘리베이터');
  const has1F = filter.features.includes('1층');
  const hasCorner = filter.features.includes('코너');
  const hasHighEff = filter.features.includes('전용률↑');

  // 예측 디밍 상태 (용도 선택에 따라 일부 칩이 흐릿해짐)
  const dim = (slot: FilterSlot) => slotStatus(slot, filter).dimmed;

  return (
    <div className="flex flex-col gap-2">
      {/* Row A — 용도 멀티 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-neutral-500">용도</span>
        {PURPOSE_ORDER.map((p) => {
          const meta = COMMERCIAL_PURPOSE_LABEL[p];
          const active = filter.purposes.includes(p);
          return (
            <button
              key={p}
              onClick={() => togglePurpose(p)}
              className={purposeChipClass(active)}
            >
              <span>{meta.emoji}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Row B — 특화 칩 (예측 디밍 적용) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter({ nearStation: stationActive ? null : 300 })}
          className={chipClass(stationActive, dim('nearStation'))}
          title="역에서 도보 5분 이내"
        >
          <Train className="size-3.5" />
          역세권
        </button>

        <button
          onClick={() => toggleFeature('주차')}
          className={chipClass(hasParking, dim('parking'))}
        >
          <Car className="size-3.5" />
          주차
        </button>

        <button
          onClick={() => toggleFeature('엘리베이터')}
          className={chipClass(hasElevator, dim('elevator'))}
        >
          <Building2 className="size-3.5" />
          엘리베이터
        </button>

        <button
          onClick={() => toggleFeature('1층')}
          className={chipClass(has1F, dim('retailFloor1'))}
          title="1층 매물 (상가에 유리)"
        >
          <ArrowUpToLine className="size-3.5" />
          1층
        </button>

        <button
          onClick={() => toggleFeature('코너')}
          className={chipClass(hasCorner, dim('cornerLot'))}
          title="코너 매물 (노출도 ↑)"
        >
          <Square className="size-3.5" />
          코너
        </button>

        <button
          onClick={() => toggleFeature('전용률↑')}
          className={chipClass(hasHighEff, dim('efficiencyRatio'))}
          title="전용률 70% 이상"
        >
          <Gauge className="size-3.5" />
          전용률↑
        </button>
      </div>
    </div>
  );
}

// 🏢 상가/사무실 테마 (amber) 용도 칩 — Row A
function purposeChipClass(active: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
    active
      ? 'bg-amber-600 text-white shadow-sm'
      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100',
  ].join(' ');
}

// 🏢 Row B 특화 칩 + 예측 디밍 opacity 처리
function chipClass(active: boolean, dimmed: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
    active
      ? 'bg-amber-600 text-white shadow-sm'
      : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
    dimmed && !active ? 'opacity-40' : '',
  ].join(' ');
}
