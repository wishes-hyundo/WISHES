// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FilterModal — 카테고리 전용 필터 모달 (Gate 패턴)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-mapfilter3 (2026-04-23): 사용자 피드백으로 완전 재설계.
//   이전 L-mapfilter2 까지는 카테고리 탭 + 거래유형 + Quick 칩 + 좌측
//   FilterAccordion 이 모두 항상 노출되어 화면이 꽉 차고 "사용하기 너무
//   불편" 하다는 피드백. 요구사항:
//     · 기본 상태: 주거·상가/사무실·토지·투자 탭만 표시
//     · 탭 클릭 → 해당 카테고리에 특화된 필터 모달이 열림
//     · 모달 안에 거래유형 · Quick 칩 · 상세 아코디언이 모두 수납
//
// 🎯 구조
//   [Header] 카테고리 테마 색상 배지 + "주거 필터" + X 닫기
//   [Body  ] 거래유형 · 사진있음 · Quick 칩 (카테고리별) · FilterAccordion
//   [Footer] 전체 해제 + "N개 매물 보기" (클릭 시 모달 닫기)
//
// 키보드: ESC → 닫기. X 버튼 → 닫기.
//   ※ [2026-05-22 정밀감사 M10] 바깥(지도) 클릭 닫기는 의도적으로 없음 —
//     백드롭을 두지 않아 패널이 열린 채로 지도 pan/zoom 이 가능해야 하므로.
//     (이전 주석의 "바깥 클릭 → 닫기" 는 실제 코드와 불일치하여 정정함.)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { Image as ImageIcon, X, Home, Building2, Trees, TrendingUp } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import {
  useMap2026Store,
  CATEGORY_THEME,
  type DealType,
  type PropertyCategory,
} from '../store';

// L-filtericon1 (2026-04-23 p.m.): 한글 1글자 배지 → 카테고리 아이콘 매핑
const CATEGORY_ICON: Record<PropertyCategory, ComponentType<SVGProps<SVGSVGElement>>> = {
  residence:     Home,
  retail_office: Building2,
  land:          Trees,
  investment:    TrendingUp,
};
import { ResidenceChips } from './ResidenceChips';
import { CommercialChips } from './CommercialChips';
import { LandChips } from './LandChips';
import { InvestmentChips } from './InvestmentChips';
import { FilterAccordion } from './FilterAccordion';
import { countActiveFilters } from '../lib/filterVisibility';

const DEALS: DealType[] = ['매매', '전세', '월세', '단기'];

export function FilterModal() {
  const open = useMap2026Store((s) => s.filterModalOpen);
  const close = useMap2026Store((s) => s.closeFilterModal);
  const filter = useMap2026Store((s) => s.filter);
  const toggleDeal = useMap2026Store((s) => s.toggleDeal);
  const setFilter = useMap2026Store((s) => s.setFilter);
  const clearFilter = useMap2026Store((s) => s.clearFilter);
  const listings = useMap2026Store((s) => s.listings);
  // [2026-05-22 정밀감사 M1] 푸터 카운트를 viewport 전체 매물 수로 단일화.
  //   기존 listings.length 는 page API limit=50 에 막혀 "50개 매물 보기" 로
  //   고정 → 리스트 헤더(1,208) 와 불일치. viewportTotal 이 진짜 총계.
  const viewportTotal = useMap2026Store((s) => s.viewportTotal);

  const theme = CATEGORY_THEME[filter.category];
  const activeCount = countActiveFilters(filter);
  const matchCount = viewportTotal ?? listings.length;

  // ESC → 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // [2026-05-22 정밀감사 M10] 모달 오픈 시 키보드 포커스를 패널로 이동.
  //   비차단 패널(aria-modal=false)이라 focus trap 은 두지 않되,
  //   키보드 사용자가 패널 컨트롤에 바로 접근하도록 닫기 버튼에 초기 포커스.
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  // L-filterpanel1 (2026-04-23 p.m.): body scroll lock 제거
  //   슬라이드 패널로 바뀌면서 지도 영역은 계속 인터랙티브 유지.
  //   패널 내부만 overflow-y-auto 로 자체 스크롤.
  if (!open) return null;

  // L-filterpanel1 (2026-04-23 p.m.): 중앙 모달 → 우측 슬라이드 패널
  //   · 지도를 가리지 않도록 우측 anchored (fixed right-0)
  //   · 백드롭 제거 — 지도 pan/zoom 계속 가능
  //   · 너비 420px (데스크탑 기본), max-w-[90vw] 로 모바일 대응
  //   · 패널 바깥 지도 영역 클릭하면 닫힘: overlay 를 pointer-events: none 으로 두고
  //     실질 클릭 수용은 우측 패널만. 지도 클릭 = 패널 닫기는 ESC + X 버튼 + 바깥 클릭 용도.
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="filter-modal-title"
      className="absolute left-0 top-0 z-20 flex h-full w-[380px] max-w-[85%] translate-x-0 flex-col overflow-hidden border-r border-neutral-200 bg-white shadow-2xl transition-transform duration-300"
    >
      <div className="relative flex h-full flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          {(() => {
            const Icon = CATEGORY_ICON[filter.category];
            return (
              <span
                className={[
                  'flex size-8 items-center justify-center rounded-lg text-white',
                  theme.accent,
                ].join(' ')}
                aria-hidden
              >
                <Icon className="size-[18px]" strokeWidth={2.25} />
              </span>
            );
          })()}
          <div className="flex-1">
            <h2 id="filter-modal-title" className="text-[16px] font-bold text-neutral-900">
              {theme.label} 필터
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={close}
            aria-label="닫기"
            // L-touchaaa1 (2026-05-02): WCAG 2.2 AAA 터치 타깃 44px (size-11) on mobile
            className="flex size-11 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 sm:size-9"
          >
            <X className="size-[18px]" />
          </button>
        </header>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          {/* 거래유형 + 사진있음 */}
          <section className="border-b border-neutral-100 px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12.5px] font-bold text-neutral-700">거래 유형</h3>
              <button
                onClick={() => setFilter({ hasImages: !filter.hasImages })}
                aria-pressed={filter.hasImages}
                className={[
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] transition',
                  filter.hasImages
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100',
                ].join(' ')}
              >
                <ImageIcon className="size-3" />
                사진 있음
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter({ deals: [] })}
                aria-pressed={filter.deals.length === 0}
                className={[
                  'rounded-full px-4 min-h-[44px] text-[12.5px] font-semibold transition active:scale-95 inline-flex items-center justify-center',
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
                      'rounded-full px-4 min-h-[44px] text-[12.5px] font-semibold transition active:scale-95 inline-flex items-center justify-center',
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
          </section>

          {/* 카테고리별 Quick 칩 */}
          <section className="border-b border-neutral-100 px-5 py-4">
            <h3 className="mb-2 text-[12.5px] font-bold text-neutral-700">
              {theme.label} 빠른 선택
            </h3>
            {filter.category === 'residence'     && <ResidenceChips />}
            {filter.category === 'retail_office' && <CommercialChips />}
            {filter.category === 'land'          && <LandChips />}
            {filter.category === 'investment'    && <InvestmentChips />}
          </section>

          {/* 상세 필터 아코디언 */}
          <section className="px-5 py-4">
            <h3 className="mb-2 text-[12.5px] font-bold text-neutral-700">상세 조건</h3>
            <FilterAccordion />
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-3 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            onClick={clearFilter}
            disabled={activeCount === 0}
            className={[
              'flex items-center gap-1 rounded-lg px-4 min-h-[44px] text-[12.5px] font-medium transition active:scale-95',
              activeCount === 0
                ? 'cursor-not-allowed text-neutral-300'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
            ].join(' ')}
          >
            <X className="size-3.5" />
            전체 해제 {activeCount > 0 ? `(${activeCount})` : ''}
          </button>
          <div className="flex-1" />
          <button
            onClick={close}
            className={[
              'flex items-center justify-center gap-2 rounded-lg px-6 min-h-[48px] text-[14px] font-bold text-white shadow-sm transition hover:brightness-110 active:scale-95',
              theme.accent,
            ].join(' ')}
          >
            <span>{matchCount.toLocaleString('ko-KR')}개 매물 보기</span>
          </button>
        </footer>
      </div>
    </aside>
  );
}
