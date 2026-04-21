// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CategoryTabs — 종합부동산 최상위 탭 (주거·상가/사무실·토지·투자)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 디자인 원칙
//   - 한 번에 하나만 선택 (Radio 성격)
//   - 카테고리별 색상 테마 (emerald / amber / lime / violet)
//   - 활성 탭은 배경 filled, 비활성은 텍스트만
//   - 라이브 카운트 = 현재 뷰포트의 해당 카테고리 매물 수
//   - 카테고리 전환 시 무관한 필터는 자동 정리 (store.setCategory)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo } from 'react';
import {
  useMap2026Store,
  CATEGORY_THEME,
  type PropertyCategory,
  type MapListing,
} from '../store';
import { zoomPulse } from '../lib/cinematicMotion';

// 카테고리 순서 (UI 상 좌→우)
const ORDER: PropertyCategory[] = ['residence', 'retail_office', 'land', 'investment'];

// 매물을 카테고리로 분류하는 휴리스틱
// 현재 DB 에는 직접적인 category 컬럼이 없으므로 type/deal 로 추정.
// (Phase 2 에서 DB 에 category enum 컬럼 추가 예정)
function inferCategory(l: MapListing): PropertyCategory {
  const t = (l.type || '').toLowerCase();
  // 토지
  if (/토지|대지|전|답|임야|잡종지/.test(t)) return 'land';
  // 상가·사무실 계열
  if (/상가|사무|오피스|지식산업|공유오피스|근생|복합/.test(t)) return 'retail_office';
  // 투자용 (수익형 표기가 있는 경우)
  if (/수익|재건축|경매/.test(t)) return 'investment';
  // 그 외 기본값 = 주거
  return 'residence';
}

export function CategoryTabs() {
  const filter = useMap2026Store((s) => s.filter);
  const setCategory = useMap2026Store((s) => s.setCategory);
  const listings = useMap2026Store((s) => s.listings);
  const map = useMap2026Store((s) => s.map);

  // 현재 뷰포트 매물 기준 카테고리별 카운트 (라이브)
  const counts = useMemo(() => {
    const c: Record<PropertyCategory, number> = {
      residence: 0, retail_office: 0, land: 0, investment: 0,
    };
    for (const l of listings) c[inferCategory(l)] += 1;
    return c;
  }, [listings]);

  return (
    <div
      className="flex items-center gap-1 border-b border-neutral-100 bg-white px-4 pt-2.5"
      role="tablist"
      aria-label="매물 카테고리"
    >
      {ORDER.map((cat) => {
        const theme = CATEGORY_THEME[cat];
        const active = filter.category === cat;
        const count = counts[cat];
        // L-ux3 (2026-04-22): 비활성 탭 count 는 의미가 없음 (서버 API 가 이미
        //   filter.category 로 걸러진 목록만 반환하므로 non-active = 항상 0).
        //   "0" 으로 찍히면 "해당 카테고리에 매물 없음" 으로 오해됨.
        //   이제 활성 탭만 실제 숫자, 나머지는 dim dot 으로 표기.
        const showCount = active;

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={active}
            title={active ? `${theme.label} ${count.toLocaleString('ko-KR')}개` : `${theme.label} 카테고리로 전환`}
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
