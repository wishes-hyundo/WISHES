// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SmartChips — Category-First 필터바 (2026-04 개편)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 레이아웃
//   Row 1: 거래유형 (전체·매매·전세·월세·단기) + 사진있음 + 전체해제  ← 전역 공통
//   Row 2: CategoryTabs (주거·상가/사무실·토지·투자)                    ← 최상위 맥락
//   Row 3: 카테고리별 전용 칩 (조건부 렌더링)                           ← 맥락 따라 교체
//
// L-ux1 (2026-04-22): 이전 4-row 구조에서 "사진있음/전체해제" row 를 Row 1 우측에
//   병합. 수직 공간 ~36px 확보. Row 3 padding py-2.5 → py-1.5 로 추가 8px.
//
// L-ux5-2 (2026-04-22): "전체" pseudo-chip 추가. 이전에는 filter.deals=[]
//   (기본값) 이 "모든 거래 노출" 을 의미하지만 UI 상으로는 어떤 버튼도
//   active 가 아니라 "아무것도 선택 안 된 상태" 로 보여, 사용자가 매매 탭이
//   선택된 것으로 오해하고 카드에 섞여 나오는 월세 포맷(`3,000/97`)을
//   "매매인데 왜 이래?" 로 읽던 UX 사고가 있었다. 이제 deals=[] 이면 "전체"
//   가 명확히 active 표기되어 "모든 거래 혼재" 상태임이 드러난다. aria-pressed
//   로 스크린리더 사용자에게도 상태를 전달.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { Image as ImageIcon, X } from 'lucide-react';
import { useMap2026Store, type DealType } from '../store';
import { countActiveFilters } from '../lib/filterVisibility';
import { CategoryTabs } from './CategoryTabs';
import { ResidenceChips } from './ResidenceChips';
import { CommercialChips } from './CommercialChips';
import { LandChips } from './LandChips';
import { InvestmentChips } from './InvestmentChips';

const DEALS: DealType[] = ['매매', '전세', '월세', '단기'];

export function SmartChips() {
  const filter = useMap2026Store((s) => s.filter);
  const toggleDeal = useMap2026Store((s) => s.toggleDeal);
  const setFilter = useMap2026Store((s) => s.setFilter);

  return (
    <div className="border-b border-neutral-100 bg-white">
      {/* Row 1 — 거래유형 + 사진있음/전체해제 */}
      <div className="flex items-center gap-1 px-4 py-2">
        <span className="pr-1 text-[11px] font-semibold text-neutral-500">거래</span>
        {/* L-ux5-2: "전체" pseudo-chip — deals=[] 일 때 active */}
        <button
          onClick={() => setFilter({ deals: [] })}
          aria-pressed={filter.deals.length === 0}
          className={[
            'rounded-full px-3 py-1 text-[12.5px] font-semibold transition',
            filter.deals.length === 0
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
          ].join(' ')}
        >
          전체
        </button>
        {DEALS.map((d) => {
          const active = filter.deals.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDeal(d)}
              aria-pressed={active}
              className={[
                'rounded-full px-3 py-1 text-[12.5px] font-semibold transition',
                active
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              ].join(' ')}
            >
              {d}
            </button>
          );
        })}
        {/* 사진있음 + 전체해제 — 우측 정렬 */}
        <button
          onClick={() => setFilter({ hasImages: !filter.hasImages })}
          aria-pressed={filter.hasImages}
          className={[
            'ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] transition',
            filter.hasImages
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-600 hover:bg-neutral-100',
          ].join(' ')}
        >
          <ImageIcon className="size-3" />
          <span className="hidden sm:inline">사진 있음</span>
        </button>
        <ClearAll />
      </div>

      {/* Row 2 — 카테고리 탭 (최상위 맥락) */}
      <CategoryTabs />

      {/* Row 3 — 카테고리별 전용 칩 (조건부 렌더링, padding 축소).
          L-mapfilter1 (2026-04-23): "빠른 선택" 라벨 추가 — 하단 FilterAccordion
          "추가 필터" 와 역할 구분을 명시. 상단=원터치 프리셋, 하단=세부 조정.
          이전엔 두 영역이 시각적으로 동등해 보여 사용자가 "같은 필터가 두 번
          나온다" 고 혼동했다. 이제 라벨로 상단 칩의 역할(빠른 접근)을 드러낸다. */}
      <div className="px-4 py-1.5">
        <div className="mb-1 text-[11px] font-semibold text-neutral-500">빠른 선택</div>
        {filter.category === 'residence'     && <ResidenceChips />}
        {filter.category === 'retail_office' && <CommercialChips />}
        {filter.category === 'land'          && <LandChips />}
        {filter.category === 'investment'    && <InvestmentChips />}
      </div>
    </div>
  );
}

function ClearAll() {
  const filter = useMap2026Store((s) => s.filter);
  const clearFilter = useMap2026Store((s) => s.clearFilter);
  const active = countActiveFilters(filter);

  if (active === 0) return null;

  return (
    <button
      onClick={clearFilter}
      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
    >
      <X className="size-3" />
      <span className="hidden sm:inline">전체 해제</span> ({active})
    </button>
  );
}
