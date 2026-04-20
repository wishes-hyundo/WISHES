// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 활성 필터 pill — 드로어 열지 않아도 항상 보임
// 각 pill 클릭 = 해당 조건만 제거
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { X } from 'lucide-react';
import { useMap2026Store } from '../store';
import { formatKRW } from '../lib/priceFormat';

interface Pill {
  key: string;
  label: string;
  clear: () => void;
}

export function ActiveFilterPills() {
  const filter = useMap2026Store((s) => s.filter);
  const setFilter = useMap2026Store((s) => s.setFilter);
  const toggleDeal = useMap2026Store((s) => s.toggleDeal);
  const toggleRoom = useMap2026Store((s) => s.toggleRoom);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);

  const pills: Pill[] = [];

  filter.deals.forEach((d) =>
    pills.push({ key: `deal-${d}`, label: d, clear: () => toggleDeal(d) })
  );
  filter.rooms.forEach((n) =>
    pills.push({
      key: `room-${n}`,
      label: n === 1 ? '원룸' : n === 2 ? '투룸' : n >= 3 ? '쓰리룸+' : `${n}룸`,
      clear: () => toggleRoom(n),
    })
  );
  if (filter.nearStation != null) {
    const min = Math.round(filter.nearStation / 60);
    pills.push({
      key: 'station',
      label: `역 도보 ${min}분`,
      clear: () => setFilter({ nearStation: null }),
    });
  }
  if (filter.newBuildYears != null) {
    pills.push({
      key: 'newbuild',
      label: `${filter.newBuildYears}년 이내 신축`,
      clear: () => setFilter({ newBuildYears: null }),
    });
  }
  if (filter.minPrice != null || filter.maxPrice != null) {
    pills.push({
      key: 'price',
      label: `매매 ${filter.minPrice ? formatKRW(filter.minPrice) : ''}~${filter.maxPrice ? formatKRW(filter.maxPrice) : ''}`,
      clear: () => setFilter({ minPrice: null, maxPrice: null }),
    });
  }
  if (filter.minDeposit != null || filter.maxDeposit != null) {
    pills.push({
      key: 'deposit',
      label: `보증금 ${filter.minDeposit ? formatKRW(filter.minDeposit) : ''}~${filter.maxDeposit ? formatKRW(filter.maxDeposit) : ''}`,
      clear: () => setFilter({ minDeposit: null, maxDeposit: null }),
    });
  }
  if (filter.minMonthly != null || filter.maxMonthly != null) {
    pills.push({
      key: 'monthly',
      label: `월세 ${filter.minMonthly ?? ''}~${filter.maxMonthly ?? ''}`,
      clear: () => setFilter({ minMonthly: null, maxMonthly: null }),
    });
  }
  if (filter.minArea != null || filter.maxArea != null) {
    pills.push({
      key: 'area',
      label: `면적 ${filter.minArea ?? ''}~${filter.maxArea ?? ''}m²`,
      clear: () => setFilter({ minArea: null, maxArea: null }),
    });
  }
  filter.propertyTypes.forEach((t) =>
    pills.push({
      key: `type-${t}`,
      label: t,
      clear: () => setFilter({ propertyTypes: filter.propertyTypes.filter((x) => x !== t) }),
    })
  );
  filter.features.forEach((f) =>
    pills.push({ key: `feat-${f}`, label: f, clear: () => toggleFeature(f) })
  );
  if (filter.hasImages) {
    pills.push({
      key: 'photos',
      label: '사진 있음',
      clear: () => setFilter({ hasImages: false }),
    });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-100 bg-emerald-50/40 px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
        적용 중
      </span>
      {pills.map((p) => (
        <button
          key={p.key}
          onClick={p.clear}
          className="group flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-800 ring-1 ring-emerald-200 hover:bg-emerald-50 hover:ring-emerald-400"
        >
          {p.label}
          <X className="size-3 text-neutral-400 group-hover:text-emerald-700" />
        </button>
      ))}
    </div>
  );
}
