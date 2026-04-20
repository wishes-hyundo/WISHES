// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SmartChips — 개별 토글 칩 그룹 (프리셋 replace 버그 없음)
// 행1: 거래유형 (매매/전세/월세/단기)
// 행2: 핵심 칩 (역세권/방개수/신축/사진있음/반려동물/주차)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Train, Home, Sparkles, Image as ImageIcon, Dog, Car, X } from 'lucide-react';
import { useMap2026Store, type DealType } from '../store';

const DEALS: DealType[] = ['매매', '전세', '월세', '단기'];
const ROOMS = [
  { n: 1, label: '원룸' },
  { n: 2, label: '투룸' },
  { n: 3, label: '쓰리룸+' },
] as const;

export function SmartChips() {
  const filter = useMap2026Store((s) => s.filter);
  const toggleDeal = useMap2026Store((s) => s.toggleDeal);
  const toggleRoom = useMap2026Store((s) => s.toggleRoom);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);
  const setFilter = useMap2026Store((s) => s.setFilter);

  const stationActive = filter.nearStation != null;
  const newBuildActive = filter.newBuildYears != null;
  const hasImagesActive = filter.hasImages;
  const hasPet = filter.features.includes('반려동물');
  const hasParking = filter.features.includes('주차');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-white px-4 py-2.5">
      {/* 거래유형 */}
      <div className="flex items-center gap-1 pr-2">
        {DEALS.map((d) => {
          const active = filter.deals.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDeal(d)}
              className={[
                'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                active
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              ].join(' ')}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-neutral-200" />

      {/* 방 개수 */}
      {ROOMS.map(({ n, label }) => {
        const active = filter.rooms.includes(n);
        return (
          <button
            key={n}
            onClick={() => toggleRoom(n)}
            className={[
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
              active
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
            ].join(' ')}
          >
            <Home className="size-3.5" />
            {label}
          </button>
        );
      })}

      {/* 역세권 */}
      <button
        onClick={() =>
          setFilter({ nearStation: stationActive ? null : 300 })
        }
        className={[
          'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
          stationActive
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
        ].join(' ')}
        title="역에서 도보 5분 이내"
      >
        <Train className="size-3.5" />
        역세권
      </button>

      {/* 신축 */}
      <button
        onClick={() =>
          setFilter({ newBuildYears: newBuildActive ? null : 3 })
        }
        className={[
          'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
          newBuildActive
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
        ].join(' ')}
        title="3년 이내 신축"
      >
        <Sparkles className="size-3.5" />
        신축
      </button>

      {/* 사진 있는 매물 */}
      <button
        onClick={() => setFilter({ hasImages: !hasImagesActive })}
        className={[
          'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
          hasImagesActive
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
        ].join(' ')}
      >
        <ImageIcon className="size-3.5" />
        사진 있음
      </button>

      {/* 반려동물 */}
      <button
        onClick={() => toggleFeature('반려동물')}
        className={[
          'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
          hasPet
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
        ].join(' ')}
      >
        <Dog className="size-3.5" />
        반려동물
      </button>

      {/* 주차 */}
      <button
        onClick={() => toggleFeature('주차')}
        className={[
          'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
          hasParking
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
        ].join(' ')}
      >
        <Car className="size-3.5" />
        주차
      </button>

      <ClearAll />
    </div>
  );
}

function ClearAll() {
  const filter = useMap2026Store((s) => s.filter);
  const clearFilter = useMap2026Store((s) => s.clearFilter);
  const active =
    filter.deals.length +
    filter.rooms.length +
    filter.propertyTypes.length +
    filter.features.length +
    (filter.nearStation != null ? 1 : 0) +
    (filter.newBuildYears != null ? 1 : 0) +
    (filter.hasImages ? 1 : 0) +
    (filter.minPrice != null || filter.maxPrice != null ? 1 : 0) +
    (filter.minDeposit != null || filter.maxDeposit != null ? 1 : 0) +
    (filter.minMonthly != null || filter.maxMonthly != null ? 1 : 0) +
    (filter.minArea != null || filter.maxArea != null ? 1 : 0);

  if (active === 0) return null;

  return (
    <button
      onClick={clearFilter}
      className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
    >
      <X className="size-3.5" />
      전체 해제 ({active})
    </button>
  );
}
