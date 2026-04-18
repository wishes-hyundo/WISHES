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
const OPTION_KEYS: { key: keyof NonNullable<ListingFilter['options']>; label: string }[] = [
  { key: 'fullOption', label: '풀옵션' },
  { key: 'pet', label: '반려동물' },
  { key: 'parking', label: '주차' },
  { key: 'elevator', label: '엘리베이터' },
  { key: 'balcony', label: '발코니' },
  { key: 'newBuild', label: '신축' },
];

// 보증금 슬라이더 (만원): 0 ~ 100,000 (10억)
const DEPOSIT_MAX = 100000;
// 월세 슬라이더 (만원): 0 ~ 500
const MONTHLY_MAX = 500;
// 면적 슬라이더 (㎡): 0 ~ 300
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

  useEffect(() => {
    if (open) setDraft(filter);
  }, [open, filter]);

  if (!open) return null;

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

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full md:max-w-3xl md:rounded-2xl bg-white rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-wishes-primary">상세 필터</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {/* 거래유형 (다중) */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">거래 유형</h3>
            <div className="flex flex-wrap gap-2">
              {DEAL_OPTIONS.map((d) => {
                const active = (draft.deals || []).includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDeal(d)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-wishes-primary/50'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 매물유형 (다중) */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">매물 유형</h3>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => {
                const active = (draft.types || []).includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      active
                        ? 'bg-wishes-secondary text-white border-wishes-secondary'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-wishes-secondary/50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 보증금 슬라이더 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">보증금</h3>
              <span className="text-xs text-wishes-muted">
                {formatMan(draft.minDeposit || 0)} ~ {draft.maxDeposit ? formatMan(draft.maxDeposit) : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted">최소</label>
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
                <label className="text-[11px] text-wishes-muted">최대</label>
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

          {/* 월세 슬라이더 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">월세</h3>
              <span className="text-xs text-wishes-muted">
                {(draft.minMonthly || 0).toLocaleString('ko-KR')}만 ~ {draft.maxMonthly ? `${draft.maxMonthly.toLocaleString('ko-KR')}만` : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted">최소</label>
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
                <label className="text-[11px] text-wishes-muted">최대</label>
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

          {/* 면적 슬라이더 */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-wishes-primary">면적</h3>
              <span className="text-xs text-wishes-muted">
                {(draft.minArea || 0)}㎡ ({((draft.minArea || 0) / 3.3).toFixed(1)}평) ~{' '}
                {draft.maxArea ? `${draft.maxArea}㎡ (${(draft.maxArea / 3.3).toFixed(1)}평)` : '제한 없음'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-wishes-muted">최소</label>
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
                <label className="text-[11px] text-wishes-muted">최대</label>
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
            <div className="grid grid-cols-4 gap-2">
              {FLOOR_CATEGORIES.map((f) => {
                const active = draft.floorCategory === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setField('floorCategory', active ? undefined : f.key)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary'
                        : 'bg-white text-gray-600 border-gray-300'
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
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 옵션 토글 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">옵션</h3>
            <div className="flex flex-wrap gap-2">
              {OPTION_KEYS.map((o) => {
                const active = !!draft.options?.[o.key];
                return (
                  <button
                    key={o.key}
                    onClick={() => toggleOption(o.key)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      active
                        ? 'bg-wishes-accent/15 text-wishes-primary border-wishes-primary'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-wishes-primary/40'
                    }`}
                  >
                    {o.label}
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
                    className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-wishes-primary text-white border-wishes-primary'
                        : 'bg-white text-gray-600 border-gray-300'
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
                className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30"
              />
            )}
          </section>

          {/* 상업용 필터 */}
          <section>
            <h3 className="text-sm font-bold text-wishes-primary mb-2.5">상업용 (상가/사무실)</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setField('businessUseable', draft.businessUseable ? undefined : true)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  draft.businessUseable
                    ? 'bg-wishes-primary text-white border-wishes-primary'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                음식점 가능
              </button>
              <button
                onClick={() => setField('goodwillFreeOnly', draft.goodwillFreeOnly ? undefined : true)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  draft.goodwillFreeOnly
                    ? 'bg-wishes-primary text-white border-wishes-primary'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                권리금 없음
              </button>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-white">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            초기화
          </button>
          <button
            onClick={apply}
            className="flex-1 px-4 py-2.5 rounded-lg bg-wishes-primary text-white text-sm font-bold hover:bg-wishes-primary/90"
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}
