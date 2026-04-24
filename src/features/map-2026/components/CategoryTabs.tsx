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

import { useRef, type KeyboardEvent, type ComponentType, type SVGProps } from 'react';
import { Home, Building2, Trees, TrendingUp } from 'lucide-react';
import {
  useMap2026Store,
  CATEGORY_THEME,
  type PropertyCategory,
} from '../store';
import { zoomPulse } from '../lib/cinematicMotion';

// 카테고리 순서 (UI 상 좌→우)
const ORDER: PropertyCategory[] = ['residence', 'retail_office', 'land', 'investment'];

// L-mapfilter2 (2026-04-23): 이모지 → Lucide 아이콘.
//   이전에는 store.CATEGORY_THEME.emoji 를 text-[15px] 로 렌더해 "아기 장난
//   같다" 는 피드백을 받았다. 일관된 라인 아이콘으로 전문성 확보.
const CATEGORY_ICON: Record<PropertyCategory, ComponentType<SVGProps<SVGSVGElement>>> = {
  residence:     Home,
  retail_office: Building2,
  land:          Trees,
  investment:    TrendingUp,
};

export function CategoryTabs() {
  const filter = useMap2026Store((s) => s.filter);
  const setCategory = useMap2026Store((s) => s.setCategory);
  const listings = useMap2026Store((s) => s.listings);
  const map = useMap2026Store((s) => s.map);
  // L-mapfilter3: 탭 클릭 시 FilterModal 을 열기. 같은 탭 재클릭 = 모달 재오픈.
  const openFilterModal = useMap2026Store((s) => s.openFilterModal);

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
      openFilterModal();
      if (map) zoomPulse(map);
    }
  };

  // L-ux5-1: 활성 탭의 진짜 카운트 = listings.length (서버 필터 적용됨)
  // L-catcount1: 비활성 탭의 카운트는 서버가 추가로 보내주는 counts 객체에서 읽음
  const categoryCounts = useMap2026Store((s) => s.categoryCounts);
  const activeCount = listings.length;

  return (
    <div
      className="flex items-center gap-1 border-b border-neutral-100 bg-white px-4 pt-2.5"
      role="tablist"
      aria-label="매물 카테고리"
    >
      {ORDER.map((cat) => {
        const theme = CATEGORY_THEME[cat];
        const Icon = CATEGORY_ICON[cat];
        const active = filter.category === cat;
        // L-catcount1: 활성 = listings.length (서버 필터 적용된 정확한 수),
        // 비활성 = categoryCounts[cat] (없으면 null 로 dim dot 유지)
        const count = active ? activeCount : (categoryCounts?.[cat] ?? null);
        const showCount = active || count != null;

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => { tabRefs.current[ORDER.indexOf(cat)] = el; }}
            title={active && count != null ? `${theme.label} ${count.toLocaleString('ko-KR')}개` : `${theme.label} 카테고리로 전환`}
            onKeyDown={(e) => handleTabKey(e, ORDER.indexOf(cat))}
            onClick={() => {
              // L-mapfilter3: 탭 클릭 = 카테고리 전환 + 모달 오픈.
              //   이미 활성 카테고리라도 클릭 시 모달 재오픈 (필터 재조정).
              if (!active) {
                setCategory(cat);
                if (map) zoomPulse(map);
              }
              openFilterModal();
            }}
            className={[
              // L-mapfilter2: 최상위 타이틀로 승격 — 글씨 + 패딩 증가.
              //   이전 text-[13px] px-4 py-2.5 → text-[14.5px] px-5 py-3.
              'relative flex items-center gap-2 rounded-t-lg px-5 py-3 text-[14.5px] font-semibold transition-all',
              active
                ? `${theme.text} bg-white`
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800',
            ].join(' ')}
          >
            <Icon className="size-[17px]" strokeWidth={2.25} aria-hidden="true" />
            <span>{theme.label}</span>
            {showCount && count != null ? (
              <span
                className={[
                  'ml-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums transition-colors',
                  active ? `${theme.accent} text-white` : 'bg-neutral-100 text-neutral-600',
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
