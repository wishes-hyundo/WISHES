// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SmartChips — Category-First 필터바 (2026-04 개편)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 레이아웃
//   Row 1: 거래유형 (매매·전세·월세·단기) + 사진있음 + 전체해제  ← 전역 공통 (L-ux1 합침)
//   Row 2: CategoryTabs (주거·상가/사무실·토지·투자)              ← 최상위 맥락
//   Row 3: 카테고리별 전용 칩 (조건부 렌더링)                     ← 맥락 따라 교체
//
// 🎯 원칙
//   - 기존 주거 편향(원룸/반려동물)은 ResidenceChips 로 완전히 이사
//   - 카테고리 전환 시 관련 없는 필터는 setCategory 액션이 자동 정리
//   - 칩 스타일은 각 카테고리 컴포넌트가 자체 테마 색상으로 책임
//
// L-ux1 (2026-04-22): 이전 4-row 구조에서 "사진있음/전체해제" row 를 Row 1 우측에
//   병합. 수직 공간 ~36px 확보. Row 3 padding py-2.5 → py-1.5 로 추가 8px.
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
      {/* Row 1 — 거래유형 + 사진있음/전체해제 (가로 합침, L-ux1 압축) */}
      <div className="flex items-center gap-1 px-4 py-2">
        <span className="pr-1 text-[11px] font-semibold text-neutral-500">거래</span>
        {DEALS.map((d) => {
          const active = filter.deals.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDeal(d)}
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

      {/* Row 3 — 카테고리별 전용 칩 (조건부 렌더링, padding 축소) */}
      <div className="px-4 py-1.5">
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
