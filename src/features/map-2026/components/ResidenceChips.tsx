// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ResidenceChips — 🏠 주거 탭 전용 칩
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 포함: 원룸/투룸/쓰리룸+ · 신축 · 반려동물 · 역세권 · 주차 · 엘리베이터
// 테마 색상: emerald (CATEGORY_THEME.residence)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Home, Sparkles, Dog, Train, Car, Building2 } from 'lucide-react';
import { useMap2026Store } from '../store';

const ROOMS = [
  { n: 1, label: '원룸' },
  { n: 2, label: '투룸' },
  { n: 3, label: '쓰리룸+' },
] as const;

export function ResidenceChips() {
  const filter = useMap2026Store((s) => s.filter);
  const toggleRoom = useMap2026Store((s) => s.toggleRoom);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);
  const setFilter = useMap2026Store((s) => s.setFilter);

  const stationActive = filter.nearStation != null;
  const newBuildActive = filter.newBuildYears != null;
  const hasPet = filter.features.includes('반려동물');
  const hasParking = filter.features.includes('주차');
  const hasElevator = filter.features.includes('엘리베이터');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 방 개수 */}
      {ROOMS.map(({ n, label }) => {
        const active = filter.rooms.includes(n);
        return (
          <button
            key={n}
            onClick={() => toggleRoom(n)}
            className={chipClass(active)}
          >
            <Home className="size-3.5" />
            {label}
          </button>
        );
      })}

      {/* 신축 */}
      <button
        onClick={() => setFilter({ newBuildYears: newBuildActive ? null : 3 })}
        className={chipClass(newBuildActive)}
        title="3년 이내 신축"
      >
        <Sparkles className="size-3.5" />
        신축
      </button>

      {/* 역세권 (공통, 주거+상가/사무실) */}
      <button
        onClick={() => setFilter({ nearStation: stationActive ? null : 300 })}
        className={chipClass(stationActive)}
        title="역에서 도보 5분 이내"
      >
        <Train className="size-3.5" />
        역세권
      </button>

      {/* 반려동물 */}
      <button
        onClick={() => toggleFeature('반려동물')}
        className={chipClass(hasPet)}
      >
        <Dog className="size-3.5" />
        반려동물
      </button>

      {/* 주차 */}
      <button
        onClick={() => toggleFeature('주차')}
        className={chipClass(hasParking)}
      >
        <Car className="size-3.5" />
        주차
      </button>

      {/* 엘리베이터 */}
      <button
        onClick={() => toggleFeature('엘리베이터')}
        className={chipClass(hasElevator)}
      >
        <Building2 className="size-3.5" />
        엘리베이터
      </button>
    </div>
  );
}

// 🏠 주거 테마 (emerald) 칩 공통 스타일
function chipClass(active: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
    active
      ? 'bg-emerald-600 text-white shadow-sm'
      : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
  ].join(' ');
}
