// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 활성 필터 pill — 드로어 열지 않아도 항상 보임
// 각 pill 클릭 = 해당 조건만 제거
// 2026-04 개편: 카테고리 테마 색상 반영 + purposes pill 추가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { X } from 'lucide-react';
import { useMap2026Store, COMMERCIAL_PURPOSE_LABEL, CATEGORY_THEME } from '../store';
import { formatKRW } from '../lib/priceFormat';

// L-ux3 (2026-04-22): 단일 bound 범위 포맷 유틸
//   기존 "매매 1억~" / "매매 ~5억" 처럼 tilde 가 매달려 어색했음.
//   이제 "1억 이상" / "5억 이하" / "1억 ~ 5억" 으로 자연어화.
function rangeLabel(
  prefix: string,
  min: number | null,
  max: number | null,
  fmt: (n: number) => string,
  unit = ''
): string {
  const lo = min != null ? fmt(min) + unit : null;
  const hi = max != null ? fmt(max) + unit : null;
  if (lo && hi) return `${prefix} ${lo} ~ ${hi}`;
  if (lo) return `${prefix} ${lo} 이상`;
  if (hi) return `${prefix} ${hi} 이하`;
  return prefix;
}

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
  const clearFilter = useMap2026Store((s) => s.clearFilter);

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
      label: rangeLabel('매매', filter.minPrice, filter.maxPrice, formatKRW),
      clear: () => setFilter({ minPrice: null, maxPrice: null }),
    });
  }
  if (filter.minDeposit != null || filter.maxDeposit != null) {
    pills.push({
      key: 'deposit',
      label: rangeLabel('보증금', filter.minDeposit, filter.maxDeposit, formatKRW),
      clear: () => setFilter({ minDeposit: null, maxDeposit: null }),
    });
  }
  if (filter.minMonthly != null || filter.maxMonthly != null) {
    pills.push({
      key: 'monthly',
      label: rangeLabel('월세', filter.minMonthly, filter.maxMonthly, (n) => String(n), '만'),
      clear: () => setFilter({ minMonthly: null, maxMonthly: null }),
    });
  }
  if (filter.minArea != null || filter.maxArea != null) {
    pills.push({
      key: 'area',
      label: rangeLabel('면적', filter.minArea, filter.maxArea, (n) => String(n), 'm²'),
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

  // L-mapfix6 (2026-04-22): null 반환은 MapClient grid-rows 4 트랙 중 3 트랙만
  //   채워서 지도 컨테이너가 row 4(1fr) 대신 row 3(auto) 에 떨어져 높이 0 으로
  //   접히는 치명적 회귀를 유발. 빈 placeholder 로 항상 grid 자식 개수 유지.
  if (pills.length === 0) return <div aria-hidden="true" />;

  // 현재 카테고리 테마 색상으로 pill 영역 테마 통일
  const theme = CATEGORY_THEME[filter.category];

  // L-pill1 (2026-04-23 p.m.): 네이버 스타일로 칩 강화
  //   · 배경 = 카테고리 accentLight 으로 영역 구분
  //   · 칩 자체 = 카테고리 accent 필 + 흰 글자 + ✕
  //   · 우측 끝에 "초기화 (N)" 링크 — 한번에 전체 필터 해제
  return (
    <div className={`flex flex-wrap items-center gap-1.5 border-b border-neutral-100 ${theme.accentLight}/60 px-4 py-2`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.text}`}>
        필터 {pills.length}
      </span>
      {pills.map((p) => (
        <button
          key={p.key}
          onClick={p.clear}
          aria-label={`${p.label} 필터 해제`}
          className={`group flex items-center gap-1 rounded-full ${theme.accent} px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90`}
        >
          {p.label}
          <X className="size-3 opacity-80 group-hover:opacity-100" />
        </button>
      ))}
      <button
        onClick={clearFilter}
        className="ml-auto text-[11.5px] font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
      >
        전체 해제
      </button>
    </div>
  );
}
