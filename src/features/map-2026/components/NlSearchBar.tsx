// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자연어 검색바 — 엔터 또는 "검색" 클릭하면 Claude 파서 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Search, X, AlertCircle } from 'lucide-react';
import { useMap2026Store } from '../store';
import { cinematicFlyTo } from '../lib/cinematicMotion';

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setFilter = useMap2026Store((s) => s.setFilter);
  const setNlQuery = useMap2026Store((s) => s.setNlQuery);
  const map = useMap2026Store((s) => s.map);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  async function submit(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
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
        cinematicFlyTo(map, { center, zoom: zoom ?? 13.5 });
      }
      setOpen(false);
    } catch (err) {
      console.error('[NlSearchBar]', err);
      setError('검색어를 이해하지 못했어요. 다른 표현으로 시도해 보세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    // L-mapfilter5 (2026-04-23): 검색바 폭을 카테고리 탭(주거·상가/사무실·토지·투자)
    //   오른쪽 끝선에 맞추기. 이전 max-w-2xl(672px) 은 카테고리 탭 폭(~520px) 을
    //   훌쩍 넘어 헤더와 탭 줄의 오른쪽 경계가 불일치했다. 420px 로 고정해
    //   Row 1 (검색바 오른쪽 끝) ≈ Row 2 (투자 탭 오른쪽 끝) 정렬.
    <div className="relative flex-1 max-w-[420px]">
      <div className="relative">
        {/* L-ux4: left-3 + 인라인 paddingLeft 36px 로 아이콘-placeholder 걹침 방지. */}
        <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-emerald-600" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            if (blurTimerRef.current) {
              clearTimeout(blurTimerRef.current);
              blurTimerRef.current = null;
            }
            setOpen(true);
          }}
          onBlur={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            blurTimerRef.current = setTimeout(() => {
              setOpen(false);
              blurTimerRef.current = null;
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
            if (e.key === 'Escape') {
              setInput('');
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="원하는 집을 자연스럽게 설명해 보세요"
          style={{ paddingLeft: '36px' }}
          className="w-full rounded-full border border-neutral-200 bg-white pr-24 py-2.5 text-[14px] placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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

      {error && (
        <div
          role="alert"
          className="absolute left-0 right-0 top-full mt-2 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 shadow-sm z-50"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="rounded-full p-0.5 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
            aria-label="닫기"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {open && !input && !error && (
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
