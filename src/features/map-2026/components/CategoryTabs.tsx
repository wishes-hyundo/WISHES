// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CategoryTabs — 종합부동산 최상위 탭 (주거·상가/사무실·토지·투자)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 디자인 원칙
//   - 한 번에 하나만 선택 (Radio 성격)
//   - 카테고리별 색상 테마 (emerald / amber / lime / violet)
//   - 활성 탭은 배경 filled, 비활성은 텍스트만
//   - 라이브 카운트 = 현재 뷰포트의 해당 카테고리 매물 수
//   - 카테고리 전환 시 무관한 필터는 자동 정리 (store.setCategory)
//
// L-ux5-1 (2026-04-22): 카운트 소스 통일.
//   이전 구현은 서버가 이미 filter.category 로 걸러 돌려준 listings 를 다시
//   `inferCategory()` regex 로 재분류해 활성 탭 뱃지 숫자를 계산했다. 문제는
//   regex 가 "오피스텔"(주거) → /오피스/ 매칭으로 retail_office 로 넘기는 등
//   오탐이 많아서 서버 232건 ↔ 클라 주거 146 으로 불일치가 발생,
//   ListPanel("232개 매물") vs CategoryTabs 뱃지("주거 146") 로 드러났다.
//   서버 응답을 그대로 신뢰해서 active 탭 = listings.length 로 단일 소스.
//   (inferCategory 전체 삭제, useMemo/MapListing import 도 정리)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useRef, type KeyboardEvent } from 'react';
import {
  useMap2026Store,
  CATEGORY_THEME,
  type PropertyCategory,
} from '../store';
import { zoomPulse } from '../lib/cinematicMotion';

// 카테고리 순서 (UI 상 좌→우)
const ORDER: PropertyCategory[] = ['residence', 'retail_office', 'land', 'investment'];

export function CategoryTabs() {
  const filter = useMap2026Store((s) => s.filter);
  const setCategory = useMap2026Store((s) => s.setCategory);
  const listings = useMap2026Store((s) => s.listings);
  const map = useMap2026Store((s) => s.map);

  // L-ux3e (2026-04-22): WAI-ARIA tab 패턴 — 키보드 사용자가
  //   ←/→ 로 탭 사이를 이동, Home/End 로 첫/끝 탭 점프하도록.
  //   이전에는 Tab 으로 4회 눌러야만 탭 사이 전환이 가능했음.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleTabKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % ORDER.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + ORDER.length) % ORDER.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ORDER.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const target = tabRefs.current[next];
    if (target) {
      target.focus();
      setCategory(ORDER[next]);
      if (map) zoomPulse(map);
    }
  };

  // L-ux5-1: 서버가 이미 filter.category 로 필터링한 listings 를 돌려주므로
  //   활성 탭의 진짜 카운트 = listings.length. 비활성 탭의 카운트는 알 수 없음
  //   (서버 왕복 없이는) → dim dot 으로 유지.
  const activeCount = listings.length;

  return (
    <div
      className="flex items-center gap-1 border-b border-neutral-100 bg-white px-4 pt-2.5"
      role="tablist"
      aria-label="매물 카테고리"
    >
      {ORDER.map((cat) => {
        const theme = CATEGORY_THEME[cat];
        const active = filter.category === cat;
        // L-ux3/L-ux5-1: 활성 탭만 실제 숫자 (서버 listings.length).
        //   비활성 탭은 dim dot (서버 왕복 없이는 알 수 없음).
        const count = active ? activeCount : 0;
        const showCount = active;

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => { tabRefs.current[ORDER.indexOf(cat)] = el; }}
            title={active ? `${theme.label} ${count.toLocaleString('ko-KR')}개` : `${theme.label} 카테고리로 전환`}
            onKeyDown={(e) => handleTabKey(e, ORDER.indexOf(cat))}
            onClick={() => {
              if (active) return;
              setCategory(cat);
              // Cinematic: 카테고리 전환 시 zoom pulse 로 컨텍스트 리셋 시각화
              if (map) zoomPulse(map);
            }}
            className={[
              'relative flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-[13px] font-semibold transition-all',
              active
                ? `${theme.text} bg-white`
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800',
            ].join(' ')}
          >
            <span className="text-[15px]">{theme.emoji}</span>
            <span>{theme.label}</span>
            {showCount ? (
              <span
                className={[
                  'ml-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums transition-colors',
                  `${theme.accent} text-white`,
                ].join(' ')}
              >
                {count.toLocaleString('ko-KR')}
              </span>
            ) : (
              <span className="ml-1 size-1 rounded-full bg-neutral-300" aria-hidden />
            )}

            {/* 활성 탭 하단 굵은 underline (카테고리 색) */}
            {active && (
              <span
                className={[
                  'absolute inset-x-2 -bottom-px h-[3px] rounded-t-full',
                  theme.accent,
                ].join(' ')}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
