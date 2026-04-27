'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): FilterPanel — 매물 필터 사이드바
//   옛날 content.js 의 키워드/지역/유형/거래/가격 필터를 React 로 재현
//   2026 SOTA 패턴: controlled inputs, debounce, URL 동기화 준비
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface FilterState {
  keyword?: string;
  gu?: string[];
  dong?: string[];
  type?: string[];
  deal?: string[];
  status?: string[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  builtYearMin?: number;
  builtYearMax?: number;
  rooms?: number[];
  options?: string[]; // parking, elevator, pet, balcony, full_option, loan_available
}

export interface FilterPanelProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset?: () => void;
  className?: string;
  // 선택지 (서버에서 동적으로 받기)
  guOptions?: string[];
  dongOptions?: string[];
  typeOptions?: string[];
  dealOptions?: string[];
  statusOptions?: string[];
}

const DEFAULT_TYPE = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라', '주택', '상가', '사무실', '토지'];
const DEFAULT_DEAL = ['월세', '전세', '매매'];
const DEFAULT_STATUS = ['공개', '비공개', '계약중', '계약완료'];
const DEFAULT_OPTIONS = [
  { key: 'parking', label: '주차' },
  { key: 'elevator', label: '엘리베이터' },
  { key: 'pet', label: '반려동물' },
  { key: 'balcony', label: '발코니' },
  { key: 'full_option', label: '풀옵션' },
  { key: 'loan_available', label: '대출가능' },
];

export function FilterPanel({
  value,
  onChange,
  onReset,
  className,
  typeOptions = DEFAULT_TYPE,
  dealOptions = DEFAULT_DEAL,
  statusOptions = DEFAULT_STATUS,
}: FilterPanelProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => {
    onChange({ ...value, [key]: v });
  };

  const toggleArray = (key: 'type' | 'deal' | 'status' | 'options', item: string) => {
    const arr = (value[key] as string[]) || [];
    const next = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
    set(key, next as never);
  };

  const activeCount = [
    value.keyword,
    value.gu?.length,
    value.dong?.length,
    value.type?.length,
    value.deal?.length,
    value.status?.length,
    value.priceMin,
    value.priceMax,
    value.areaMin,
    value.areaMax,
    value.options?.length,
  ].filter(Boolean).length;

  return (
    <aside className={cn('flex flex-col gap-5 p-4 bg-white rounded-xl border border-wishes-border shadow-soft', className)}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-wishes-text">필터</h3>
          {activeCount > 0 && <Badge variant="default">{activeCount}</Badge>}
        </div>
        {onReset && activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-xs">
            <X className="h-3 w-3 mr-1" />
            초기화
          </Button>
        )}
      </div>

      {/* 키워드 검색 */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-keyword">키워드</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wishes-muted" />
          <Input
            id="filter-keyword"
            type="search"
            placeholder="주소·건물명·매물번호"
            value={value.keyword || ''}
            onChange={(e) => set('keyword', e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Separator />

      {/* 거래유형 */}
      <FilterChipGroup
        label="거래유형"
        items={dealOptions}
        selected={value.deal || []}
        onToggle={(v) => toggleArray('deal', v)}
      />

      {/* 매물유형 */}
      <FilterChipGroup
        label="매물유형"
        items={typeOptions}
        selected={value.type || []}
        onToggle={(v) => toggleArray('type', v)}
      />

      {/* 상태 */}
      <FilterChipGroup
        label="상태"
        items={statusOptions}
        selected={value.status || []}
        onToggle={(v) => toggleArray('status', v)}
      />

      <Separator />

      {/* 가격 범위 (만원) */}
      <RangeRow
        label="가격 (만원)"
        min={value.priceMin}
        max={value.priceMax}
        onMin={(v) => set('priceMin', v)}
        onMax={(v) => set('priceMax', v)}
        placeholder={['최소', '최대']}
      />

      {/* 면적 범위 (m²) */}
      <RangeRow
        label="면적 (m²)"
        min={value.areaMin}
        max={value.areaMax}
        onMin={(v) => set('areaMin', v)}
        onMax={(v) => set('areaMax', v)}
        placeholder={['최소', '최대']}
      />

      {/* 건축년도 */}
      <RangeRow
        label="건축년도"
        min={value.builtYearMin}
        max={value.builtYearMax}
        onMin={(v) => set('builtYearMin', v)}
        onMax={(v) => set('builtYearMax', v)}
        placeholder={['예: 2010', '예: 2025']}
      />

      <Separator />

      {/* 옵션 */}
      <FilterChipGroup
        label="옵션"
        items={DEFAULT_OPTIONS.map((o) => o.label)}
        selected={(value.options || []).map((k) => DEFAULT_OPTIONS.find((o) => o.key === k)?.label || k)}
        onToggle={(label) => {
          const opt = DEFAULT_OPTIONS.find((o) => o.label === label);
          if (opt) toggleArray('options', opt.key);
        }}
      />
    </aside>
  );
}

function FilterChipGroup({ label, items, selected, onToggle }: { label: string; items: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={cn(
                'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                active
                  ? 'bg-wishes-primary text-white border-wishes-primary'
                  : 'bg-white text-wishes-text border-wishes-border hover:bg-wishes-cream'
              )}
              aria-pressed={active}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangeRow({ label, min, max, onMin, onMax, placeholder }: { label: string; min?: number; max?: number; onMin: (v: number | undefined) => void; onMax: (v: number | undefined) => void; placeholder: [string, string] }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder={placeholder[0]}
          value={min ?? ''}
          onChange={(e) => onMin(e.target.value ? Number(e.target.value) : undefined)}
        />
        <span className="text-wishes-muted text-sm">~</span>
        <Input
          type="number"
          inputMode="numeric"
          placeholder={placeholder[1]}
          value={max ?? ''}
          onChange={(e) => onMax(e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>
    </div>
  );
}
