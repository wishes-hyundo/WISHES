// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 정렬 메뉴 — 1급 시민 (기존 /map 에는 없었음)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { ArrowUpDown, Check } from 'lucide-react';
import { useState } from 'react';
import { useMap2026Store, type SortKey } from '../store';

const OPTIONS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: 'recent', label: '최신순', hint: '최근 등록/갱신' },
  { key: 'price_asc', label: '가격 낮은순', hint: '저렴한 매물부터' },
  { key: 'price_desc', label: '가격 높은순', hint: '프리미엄부터' },
  { key: 'area_desc', label: '면적 큰순', hint: '넓은 집부터' },
  { key: 'deal_score', label: 'AI 추천순', hint: '가성비 + 큐레이션' },
];

export function SortMenu() {
  const [open, setOpen] = useState(false);
  const sort = useMap2026Store((s) => s.sort);
  const setSort = useMap2026Store((s) => s.setSort);
  const current = OPTIONS.find((o) => o.key === sort) ?? OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-neutral-700 hover:bg-neutral-100"
      >
        <ArrowUpDown className="size-3.5" />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-52 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSort(o.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-50"
            >
              <Check
                className={[
                  'size-3.5',
                  o.key === sort ? 'text-emerald-600' : 'text-transparent',
                ].join(' ')}
              />
              <div className="flex-1">
                <div className="text-[13px] font-medium">{o.label}</div>
                <div className="text-[11px] text-neutral-500">{o.hint}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
