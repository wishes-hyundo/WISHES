// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 활성 필터 pill — 드로어 열지 않아도 항상 보임
// 각 pill 클릭 = 해당 조건만 제거
// 2026-04 개편: 카테고리 테마 색상 반영 + purposes pill 추가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { X } from 'lucide-react';
import { useMap2026Store, COMMERCIAL_PURPOSE_LABEL, CATEGORY_THEME } from '../store';
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
  const togglePurpose = useMap2026Store((s) => s.togglePurpose);

  const pills: Pill[] = [];

  // 거래유형 (전역)
  filter.deals.forEach((d) =>
    pills.push({ key: `deal-${d}`, label: d, clear: () => toggleDeal(d) })
  );

  // 🏢 상가/사무실 용도 (카테고리가 retail_office 일 때만 유효)
  filter.purposes.forEach((p) => {
    const meta = COMMERCIAL_PURPOSE_LABEL[p];
    pills.push({
      key: `purpose-${p}`,
      label: `${meta.emoji} ${meta.label}`,
      clear: () => togglePurpose(p),
    });
  });

  // 방 개수 (주거 전용 — setCategory 가 탭 전환 시 자동 비움)
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

  // 토지 지목 / 주거 propertyTypes — 공용
  filter.propertyTypes.forEach((t) =>
    pills.push({
      key: `type-${t}`,
      label: t,
      clear: () => setFilter({ propertyTypes: filter.propertyTypes.filter((x) => x !== t) }),
    })
  );

  // 기타 features (주차, 엘리베이터, 반려동물, 1층, 코너, 전용률↑, 도로접함 …)
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

  // 현재 카테고리 테마 색상으로 pill 영역 테마 통일
  const theme = CATEGORY_THEME[filter.category];

  return (
    <div className={`flex flex-wrap items-center gap-1.5 border-b border-neutral-100 ${theme.accentLight}/50 px-4 py-2`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.text}`}>
        {theme.emoji} {theme.label} · 적용 중
      </span>
      {pills.map((p) => (
        <button
          key={p.key}
          onClick={p.clear}
          className="group flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-50 hover:ring-neutral-400"
        >
          {p.label}
          <X className="size-3 text-neutral-400 group-hover:text-neutral-700" />
        </button>
      ))}
    </div>
  );
}
