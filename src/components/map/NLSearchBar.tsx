// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NLSearchBar — 자연어 매물 검색 상단 바
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 직방·호갱노노 "AI중개사" 패턴. 사용자는 자연어로 쓰고 서버가 필터+벡터로 해석.
//   - 예: "역세권 3억 이하 전세 강남"
//   - 엔터 시 /api/map/search 호출 → parsed 필터 칩 + 결과 리스트 시트 표시
//   - 지도 bounds 를 함께 전달해 "현재 화면 안에서만" 검색 (토글 가능)

'use client';

import { useState, useTransition, FormEvent } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import type { Listing, MapBounds } from '@/types';

interface Props {
  bounds?: MapBounds | null;
  onResults: (results: Listing[], parsed: ParsedHint | null) => void;
  placeholder?: string;
  defaultValue?: string;
  /** 현재 지도 화면 안에서만 검색할지 */
  scopedToBounds?: boolean;
  className?: string;
}

export interface ParsedHint {
  deal?: string;
  type?: string;
  dong?: string;
  maxDeposit?: number;
  minDeposit?: number;
  maxMonthly?: number;
  minArea?: number;
  maxArea?: number;
  rooms?: number;
  summary?: string;
}

const EXAMPLES = [
  '강남 원룸 전세 2억 이하',
  '역세권 오피스텔 월세 80 이하',
  '반포 방 3개 아파트 전세 5억',
  '주차 가능한 사무실 20평 이상',
];

export default function NLSearchBar({
  bounds,
  onResults,
  placeholder = '자연어로 매물 검색 (예: 강남 원룸 전세 2억 이하)',
  defaultValue = '',
  scopedToBounds = true,
  className = '',
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);
  const [parsed, setParsed] = useState<ParsedHint | null>(null);

  const doSearch = (q: string) => {
    if (!q.trim()) return;
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ q: q.trim() });
        if (scopedToBounds && bounds) {
          params.set('swLat', String(bounds.swLat));
          params.set('swLng', String(bounds.swLng));
          params.set('neLat', String(bounds.neLat));
          params.set('neLng', String(bounds.neLng));
        }
        const resp = await fetch(`/api/map/search?${params}`);
        const json = await resp.json();
        if (json.success) {
          setParsed(json.parsed || null);
          onResults(json.data || [], json.parsed || null);
        }
      } catch (err) {
        console.error('NL search error', err);
      }
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSearch(value);
  };

  return (
    <form onSubmit={onSubmit} className={`relative w-full ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 shadow-sm transition-all ${
          focused ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200'
        }`}
      >
        <Sparkles className="h-5 w-5 text-indigo-500 shrink-0" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          aria-label="자연어 매물 검색"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              setParsed(null);
              onResults([], null);
            }}
            className="rounded-full p-1 hover:bg-gray-100"
            aria-label="검색어 지우기"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          aria-label="검색"
        >
          {pending ? '검색중…' : <Search className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {/* 해석 결과 칩 */}
      {parsed && parsed.summary && parsed.summary !== '조건 미인식' && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-2 text-xs text-gray-700" aria-live="polite">
          <span className="font-medium text-indigo-600">해석:</span>
          {parsed.dong && <Chip>{parsed.dong}</Chip>}
          {parsed.type && <Chip>{parsed.type}</Chip>}
          {parsed.deal && <Chip>{parsed.deal}</Chip>}
          {parsed.maxDeposit && <Chip>보증금 ≤ {parsed.maxDeposit.toLocaleString()}만원</Chip>}
          {parsed.maxMonthly && <Chip>월세 ≤ {parsed.maxMonthly}만원</Chip>}
          {parsed.minArea && <Chip>{parsed.minArea}㎡ 이상</Chip>}
          {parsed.rooms && <Chip>{parsed.rooms}룸</Chip>}
        </div>
      )}

      {/* 예시 제안 (포커스 & 빈 입력 시) */}
      {focused && !value && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 text-xs font-medium text-gray-500">이렇게 검색해보세요</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(ex);
                  doSearch(ex);
                }}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
      {children}
    </span>
  );
}
