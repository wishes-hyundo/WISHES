'use client';

import { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { ListingFilter, DealType, ListingType } from '@/types';

interface Props {
  open: boolean;
  filter: ListingFilter;
  onChange: (next: ListingFilter) => void;
  onClose: () => void;
  onReset: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상세 필터 Drawer
// 데스크탑: 우측에서 슬라이드 인 (420px)
// 모바일: 하단에서 bottom sheet (드래그 핸들 포함)
// 모달처럼 화면 전체를 막지 않고 지도와 함께 존재하는 사이드 패널.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEAL_OPTIONS: DealType[] = ['매매', '전세', '월세', '단기'];
const TYPE_OPTIONS: ListingType[] = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라', '상가', '사무실'];
const DIRECTIONS = ['남', '동', '서', '북', '남동', '남서', '북동', '북서'];
const FLOOR_CATEGORIES: { key: 'basement' | 'low' | 'mid' | 'high'; label: string }[] = [
  { key: 'basement', label: '지하' },
  { key: 'low', label: '저층 (1-3층)' },
  { key: 'mid', label: '중층 (4-7층)' },
  { key: 'high', label: '고층 (8층+)' },
];
const MOVE_IN: { key: 'immediate' | 'negotiable' | 'date'; label: string }[] = [
  { key: 'immediate', label: '즉시 입주' },
  { key: 'negotiable', label: '협의' },
  { key: 'date', label: '날짜 지정' },
];
const OPTION_KEYS: { key: keyof NonNullable<ListingFilter['options']>; label: string; icon: string }[] = [
  { key: 'fullOption', label: '풀옵션', icon: '🛋️' },
  { key: 'pet', label: '반려동물', icon: '🐾' },
  { key: 'parking', label: '주차', icon: '🚗' },
  { key: 'elevator', label: '엘리베이터', icon: '🛗' },
  { key: 'balcony', label: '발코니', icon: '🌿' },
  { key: 'newBuild', label: '신축', icon: '✨' },
];

const DEPOSIT_MAX = 100000;
const MONTHLY_MAX = 500;
const AREA_MAX = 300;

function formatMan(value: number): string {
  if (value >= 10000) {
    const uk = Math.floor(value / 10000);
    const man = value % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}만` : `${uk}억`;
  }
  return `${value.toLocaleString('ko-KR')}만`;
}

export default function MapFilterSheet({ open, filter, onChange, onClose, onReset }: Props) {
  const [draft, setDraft] = useState<ListingFilter>(filter);

  // 열릴 때마다 부모 filter로 초기화 (열린 상태에서 부모가 바꿔도 draft 유지)
  useEffect(() => {
    if (open) setDraft(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // body 스크롤 잠금 (열린 동안만)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggleDeal = (deal: DealType) => {
    const list = new Set(draft.deals || []);
    list.has(deal) ? list.delete(deal) : list.add(deal);
    setDraft({ ...draft, deals: Array.from(list) });
  };

  const toggleType = (type: ListingType) => {
    const list = new Set(draft.types || []);
    list.has(type) ? list.delete(type) : list.add(type);
    setDraft({ ...draft, types: Array.from(list) });
  };

  const toggleOption = (key: keyof NonNullable<ListingFilter['options']>) => {
    const opts = { ...(draft.options || {}) };
    opts[key] = !opts[key];
    setDraft({ ...draft, options: opts });
  };

  const setField = <K extends keyof ListingFilter>(key: K, value: ListingFilter[K]) => {
    setDraft({ ...draft, [key]: value });
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  const reset = () => {
    const empty: ListingFilter = {};
    setDraft(empty);
    onReset();
  };

  // 활성 필터 수
  const activeCount = [
    (draft.deals || []).length,
    (draft.types || []).length,
    draft.minDeposit ? 1 : 0,
    draft.maxDeposit ? 1 : 0,
    draft.minMonthly ? 1 : 0,
    draft.maxMonthly ? 1 : 0,
    draft.minArea ? 1 : 0,
    draft.maxArea ? 1 : 0,
    draft.floorCategory ? 1 : 0,
    draft.direction ? 1 : 0,
    draft.moveIn ? 1 : 0,
    Object.values(draft.options || {}).filter(Boolean).length,
    draft.businessUseable ? 1 : 0,
    draft.goodwillFreeOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <>
      {/* ━━━ 백드롭 (클릭 시 닫힘, blur만 부드럽게) ━━━ */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ━━━ Drawer 본체 ━━━
          데스크탑: 우측 고정 420px 슬라이드 인
          모바일: 하단 bottom sheet (91vh) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="상세 필터"
        aria-hidden={!open}
        className={`fixed z-[70] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out
          inset-x-0 bottom-0 rounded-t-3xl max-h-[92vh]
          md:inset-x-auto md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[440px] md:max-h-none md:rounded-none md:border-l md:border-gray-200
          ${open
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full pointer-events-none'
          }`}
      >
        {/* 모바일 드래그 핸들 */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 md:pt-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-wishes-primary">상세 필터</h2>
            <p className="text-[11px] text-wishes-muted mt-0.5">
              {activeCount > 0 ? `${activeCount}개 조건 선택됨 · 적용하면 지도에 반영` : '원하는 조건으로 좁혀보세요'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7 custom-scrollbar">
          {/* 거래 유형 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">거래 유형</h3>
            <div className="flex flex-wrap gap-2">
              {DEAL_OPTIONS.map((d) => {
                const active = (draft.deals || []).includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDeal(d)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/50'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 매물 유형 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">매물 유형</h3>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((t) => {
                const active = (draft.types || []).includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-secondary text-white border-wishes-secondary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-secondary/50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 보증금 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">보증금</h3>
              <span className="text-xs text-wishes-secondary font-semibold">
                {formatMan(draft.minDeposit || 0)} ~ {draft.maxDeposit ? formatMan(draft.maxDeposit) : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최소</label>
                <input
                  type="range"
                  min={0}
                  max={DEPOSIT_MAX}
                  step={500}
                  value={draft.minDeposit || 0}
                  onChange={(e) => setField('minDeposit', Number(e.target.value) || undefined)}
                  className="w-full accent-wishes-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최대</label>
                <input
                  type="range"
                  min={0}
                  max={DEPOSIT_MAX}
                  step={500}
                  value={draft.maxDeposit || DEPOSIT_MAX}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setField('maxDeposit', v >= DEPOSIT_MAX ? undefined : v);
                  }}
                  className="w-full accent-wishes-primary"
                />
              </div>
            </div>
          </section>

          {/* 월세 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">월세</h3>
              <span className="text-xs text-wishes-secondary font-semibold">
                {(draft.minMonthly || 0).toLocaleString('ko-KR')}만 ~ {draft.maxMonthly ? `${draft.maxMonthly.toLocaleString('ko-KR')}만` : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최소</label>
                <input
                  type="range"
                  min={0}
                  max={MONTHLY_MAX}
                  step={5}
                  value={draft.minMonthly || 0}
                  onChange={(e) => setField('minMonthly', Number(e.target.value) || undefined)}
                  className="w-full accent-wishes-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최대</label>
                <input
                  type="range"
                  min={0}
                  max={MONTHLY_MAX}
                  step={5}
                  value={draft.maxMonthly || MONTHLY_MAX}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setField('maxMonthly', v >= MONTHLY_MAX ? undefined : v);
                  }}
                  className="w-full accent-wishes-primary"
                />
              </div>
            </div>
          </section>

          {/* 면적 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">면적</h3>
              <span className="text-xs text-wishes-secondary font-semibold">
                {(draft.minArea || 0)}㎡ ({((draft.minArea || 0) / 3.3).toFixed(1)}평) ~{' '}
                {draft.maxArea ? `${draft.maxArea}㎡ (${(draft.maxArea / 3.3).toFixed(1)}평)` : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최소</label>
                <input
                  type="range"
                  min={0}
                  max={AREA_MAX}
                  step={5}
                  value={draft.minArea || 0}
                  onChange={(e) => setField('minArea', Number(e.target.value) || undefined)}
                  className="w-full accent-wishes-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-wishes-muted block mb-1">최대</label>
                <input
                  type="range"
                  min={0}
                  max={AREA_MAX}
                  step={5}
                  value={draft.maxArea || AREA_MAX}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setField('maxArea', v >= AREA_MAX ? undefined : v);
                  }}
                  className="w-full accent-wishes-primary"
                />
              </div>
            </div>
          </section>

          {/* 층수 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">층수</h3>
            <div className="grid grid-cols-2 gap-2">
              {FLOOR_CATEGORIES.map((f) => {
                const active = draft.floorCategory === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setField('floorCategory', active ? undefined : f.key)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 방향 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">방향</h3>
            <div className="grid grid-cols-4 gap-2">
              {DIRECTIONS.map((d) => {
                const active = draft.direction === d;
                return (
                  <button
                    key={d}
                    onClick={() => setField('direction', active ? undefined : d)}
                    className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 옵션 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">옵션</h3>
            <div className="grid grid-cols-3 gap-2">
              {OPTION_KEYS.map((o) => {
                const active = !!draft.options?.[o.key];
                return (
                  <button
                    key={o.key}
                    onClick={() => toggleOption(o.key)}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-accent/15 text-wishes-primary border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/30'
                    }`}
                  >
                    <span className="text-sm">{o.icon}</span>
                    <span>{o.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 입주 가능일 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">입주 가능일</h3>
            <div className="grid grid-cols-3 gap-2">
              {MOVE_IN.map((m) => {
                const active = draft.moveIn === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setField('moveIn', active ? undefined : m.key)}
                    className={`px-2 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {draft.moveIn === 'date' && (
              <input
                type="date"
                value={draft.moveInDate || ''}
                onChange={(e) => setField('moveInDate', e.target.value || undefined)}
                className="mt-3 w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/20 focus:border-wishes-primary"
              />
            )}
          </section>

          {/* 상업용 */}
          <section className="pb-2">
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">상업용 (상가/사무실)</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setField('businessUseable', draft.businessUseable ? undefined : true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  draft.businessUseable
                    ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40'
                }`}
              >
                🍽️ 음식점 가능
              </button>
              <button
                onClick={() => setField('goodwillFreeOnly', draft.goodwillFreeOnly ? undefined : true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  draft.goodwillFreeOnly
                    ? 'bg-wishes-primary text-white border-wishes-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-primary/40'
                }`}
              >
                💰 권리금 없음
              </button>
            </div>
          </section>
        </div>

        {/* 푸터 (고정) */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-white safe-area-pb">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            초기화
          </button>
          <button
            onClick={apply}
            className="flex-1 px-4 py-3 rounded-xl bg-wishes-primary text-white text-sm font-bold hover:bg-wishes-primary/90 shadow-sm transition-all active:scale-[0.98]"
          >
            {activeCount > 0 ? `${activeCount}개 조건 적용` : '적용하기'}
          </button>
        </div>
      </div>
    </>
  );
}
