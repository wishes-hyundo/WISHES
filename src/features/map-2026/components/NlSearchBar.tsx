// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자연어 검색바 — 엔터 또는 "검색" 클릭하면 Claude 파서 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useState } from 'react';
import { Sparkles, Search, X } from 'lucide-react';
import { useMap2026Store } from '../store';

const SUGGESTIONS = [
  '강남역 도보 5분 투룸 월세 100 이하',
  '신축 오피스텔 전세 3억 이하',
  '성수동 반려동물 가능한 원룸',
  '매매 5억 이하 주차 가능',
  '여의도 단기 임대 100만원',
];

export function NlSearchBar() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const setFilter = useMap2026Store((s) => s.setFilter);
  const setNlQuery = useMap2026Store((s) => s.setNlQuery);
  const map = useMap2026Store((s) => s.map);

  async function submit(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setNlQuery(q);
    try {
      const res = await fetch('/api/map/search-nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`nl ${res.status}`);
      const { filter, center, zoom } = await res.json();
      if (filter) setFilter(filter);
      if (center && map) {
        map.flyTo({ center, zoom: zoom ?? 13.5, duration: 1200 });
      }
      setOpen(false);
    } catch (err) {
      console.error('[NlSearchBar]', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex-1 max-w-2xl">
      <div className="relative">
        <Sparkles className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-emerald-600" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
            if (e.key === 'Escape') { setInput(''); setOpen(false); }
          }}
          placeholder="원하는 집을 자연스럽게 설명해 보세요"
          className="w-full rounded-full border border-neutral-200 bg-white pl-11 pr-24 py-2.5 text-[14px] placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          disabled={busy}
        />
        {input && (
          <button
            onClick={() => setInput('')}
            className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label="지우기"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => submit(input)}
          disabled={busy || !input.trim()}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40 hover:bg-emerald-700"
        >
          <Search className="size-3.5" />
          {busy ? '검색중' : '검색'}
        </button>
      </div>

      {open && !input && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl z-50">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            이렇게 검색해 보세요
          </div>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setInput(s);
                submit(s);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-neutral-50"
            >
              <Sparkles className="size-3.5 text-emerald-500" />
              <span className="text-neutral-700">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
