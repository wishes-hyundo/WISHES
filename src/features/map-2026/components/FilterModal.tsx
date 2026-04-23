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
// 키보드: ESC → 닫기. 바깥 클릭 → 닫기.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import {
  useMap2026Store,
  CATEGORY_THEME,
  type DealType,
} from '../store';
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

  const theme = CATEGORY_THEME[filter.category];
  const activeCount = countActiveFilters(filter);

  // ESC → 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="필터 닫기"
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Modal card */}
      <div className="relative flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <span
            className={[
              'flex size-8 items-center justify-center rounded-lg text-[14px] font-bold text-white',
              theme.accent,
            ].join(' ')}
            aria-hidden
          >
            {theme.label.charAt(0)}
          </span>
          <div className="flex-1">
            <h2 id="filter-modal-title" className="text-[16px] font-bold text-neutral-900">
              {theme.label} 필터
            </h2>
            <p className="text-[11.5px] text-neutral-500">
              {theme.label} 카테고리에 맞춘 세부 조건을 설정하세요
            </p>
          </div>
          <button
            onClick={close}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
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
                  'rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
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
                      'rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
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
              'flex items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition',
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
              'flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:brightness-110',
              theme.accent,
            ].join(' ')}
          >
            <span>{listings.length.toLocaleString('ko-KR')}개 매물 보기</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
