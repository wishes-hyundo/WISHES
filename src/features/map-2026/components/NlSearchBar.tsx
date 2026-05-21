// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NlSearchBar — /map 통합 검색바 (3-in-1)
//
// CLAUDE.md (사장님 명령 2026-04-29) — 검색창 1개로 3가지 동시 처리:
//   1) 매물번호 (5-6자리 숫자만)        → 즉시 해당 매물 카드 오픈
//   2) 주소 패턴 (지역명/도로명/번지)   → /api/address-search → 지도 이동
//   3) 자연어                          → /api/map/search-nl (Gemini Flash 무료)
//
// L-mapsearch3in1 (2026-05-02): 입력 라우팅 추가.
//   detectIntent() 가 입력을 분석해 상위 3 경로 중 하나로 dispatch.
//   - 매물번호 우선 (가장 빠름, 정확)
//   - 한글/숫자 혼합 + 동/구/로/길 키워드 → 주소
//   - 그 외 → NL parser
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

// L-mapsearch3in1: 입력 의도 분류
type SearchIntent =
  | { kind: 'listing'; id: number }
  | { kind: 'address'; query: string }
  | { kind: 'nl'; query: string };

function detectIntent(raw: string): SearchIntent {
  const q = raw.trim();
  // 1) 매물번호 — 5-6 자리 숫자만 (공백/comma 등 무시)
  if (/^\d{5,6}$/.test(q)) {
    return { kind: 'listing', id: Number.parseInt(q, 10) };
  }
  // 2) 주소 패턴 — 동/구/로/길/번지 등 키워드 + 한글 위주
  //    NL 트리거 키워드(투룸/월세/매매/이하/반려/주차 등) 가 없을 때만 주소로 인식
  const hasNlKeyword = /(원룸|투룸|쓰리룸|포룸|월세|전세|매매|보증금|단기|이하|이상|미만|초과|반려|주차|풀옵|엘리베|신축|역세권|도보|분|평|만원|억|천만|보안)/.test(q);
  const hasAddressKeyword = /(동|구|로|길|번지|읍|면|리|시|군|광역시|특별시|특별자치도|도청)$/.test(q)
    || /\b(\d+)(번지|동|호)\b/.test(q)
    || /(동|로|길)\s*\d+/.test(q);
  // 한글만 있고 NL 키워드 없음 + 주소 키워드 또는 한글+숫자 혼합 → 주소
  const isKoreanOnly = /^[가-힣\s\d-]+$/.test(q);
  if (!hasNlKeyword && isKoreanOnly && (hasAddressKeyword || /\d/.test(q))) {
    return { kind: 'address', query: q };
  }
  // 3) 그 외 → NL
  return { kind: 'nl', query: q };
}

export function NlSearchBar() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // [2026-05-22 정밀감사 M9] in-flight 검색 fetch race + 언마운트 setState 방어.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const setFilter = useMap2026Store((s) => s.setFilter);
  const setNlQuery = useMap2026Store((s) => s.setNlQuery);
  const map = useMap2026Store((s) => s.map);
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    abortRef.current?.abort();
  }, []);

  async function submit(q: string) {
    if (!q.trim() || busy) return;
    // 직전 in-flight 요청 취소 (연속 검색 race 방지)
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    const intent = detectIntent(q);
    try {
      // ─── 1) 매물번호 ────────────────────────────────────
      if (intent.kind === 'listing') {
        // 매물 존재 확인 — /api/listings/[id] 호출
        const res = await fetch(`/api/listings/${intent.id}`, { method: 'GET', signal: ctrl.signal });
        if (res.status === 404) {
          setError(`매물 #${intent.id} 을(를) 찾을 수 없어요.`);
          return;
        }
        if (!res.ok) {
          setError('매물 조회 중 오류가 발생했어요.');
          return;
        }
        const data = await res.json();
        // /api/listings/[id] 응답 shape: { success: true, data: { id, lat, lng, ... } }
        // L-mapsearch3in1-fix1 (2026-05-02): data.data 우선 — 이전엔 data.listing 만 봐서 좌표 0
        const lst = data?.data ?? data?.listing ?? data;
        // 지도 이동 (매물 좌표 있으면)
        const lat = Number(lst?.lat);
        const lng = Number(lst?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && map) {
          cinematicFlyTo(map, { center: [lng, lat], zoom: 16 });
        }
        // 카드 오픈 — useListingUrlSync 가 URL ?listing=ID 자동 동기화
        openListingDetail(intent.id);
        setOpen(false);
        return;
      }
      // ─── 2) 주소 패턴 ───────────────────────────────────
      if (intent.kind === 'address') {
        const res = await fetch('/api/address-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: intent.query }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`address ${res.status}`);
        const json = await res.json();
        const top = Array.isArray(json?.data) ? json.data[0] : null;
        const lat = Number(top?.lat ?? top?.y);
        const lng = Number(top?.lng ?? top?.x);
        if (Number.isFinite(lat) && Number.isFinite(lng) && map) {
          cinematicFlyTo(map, { center: [lng, lat], zoom: 14 });
          setOpen(false);
          return;
        }
        // 주소 미스 → NL 로 fallback (사용자 의도가 자연어였을 수 있음)
      }
      // ─── 3) 자연어 ──────────────────────────────────────
      setNlQuery(q);
      const res = await fetch('/api/map/search-nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`nl ${res.status}`);
      const { filter, center, zoom } = await res.json();
      if (filter) setFilter(filter);
      if (center && map) {
        cinematicFlyTo(map, { center, zoom: zoom ?? 13.5 });
      }
      setOpen(false);
    } catch (err) {
      // 후속 검색이 이 요청을 취소한 경우 — 조용히 무시 (에러 표시 X).
      if ((err as Error)?.name === 'AbortError') return;
      console.error('[NlSearchBar]', err);
      if (mountedRef.current) {
        setError('검색어를 이해하지 못했어요. 다른 표현으로 시도해 보세요.');
      }
    } finally {
      // 더 새로운 요청이 시작됐으면 그 요청이 busy 를 관리 — 건드리지 않음.
      if (mountedRef.current && abortRef.current === ctrl) setBusy(false);
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
          placeholder="매물번호 · 주소 · 자연어 검색"
          style={{ paddingLeft: '36px' }}
          className="w-full rounded-full border border-neutral-200 bg-white pr-24 py-2.5 text-[14px] placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          disabled={busy}
          inputMode="search"
          autoComplete="off"
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
          {/* L-mapsearch3in1: 매물번호 / 주소 예시 추가 */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setInput('53190'); submit('53190'); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-neutral-50"
          >
            <Search className="size-3.5 text-neutral-400" />
            <span className="text-neutral-700">매물번호 — <span className="font-mono">53190</span></span>
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setInput('서울특별시 관악구 신림동'); submit('서울특별시 관악구 신림동'); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-neutral-50"
          >
            <Search className="size-3.5 text-neutral-400" />
            <span className="text-neutral-700">주소 — 서울특별시 관악구 신림동</span>
          </button>
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
