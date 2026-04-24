// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ScopeToggle — '내 매물' ↔ '전체' 토글 (v7 §4 scope 전파)
//
// 목적
//   중개인(/admin/search)에서 "내가 올린 매물만" 볼지 "전체"를 볼지 전환.
//   공유 URL 에도 scope=mine 플래그가 유지되어 SumBox 에 소스 뱃지로 반영.
//
// UX
//   - segmented control (all|mine) — 라디오 패턴, 선택 시 aria-pressed
//   - disabled={hideForGuest} — 로그인하지 않은 고객은 'mine' 비활성
//   - count 뱃지: 현재 scope 에 해당하는 매물 개수 (optional)
//
// 접근성
//   role="radiogroup" aria-label="매물 범위"
//   각 옵션 role="radio" aria-checked, 키보드 ←/→ 로 전환
//
// v7 §4 참고
//   - store.scope 와 1:1 바인딩
//   - URL param: scope=mine (all 이면 생략)
//   - 게스트 로그인 가드: adminMode={false} 면 mine 비활성 + 툴팁
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store } from '../store';

export interface ScopeToggleProps {
  /** 로그인한 중개인만 'mine' 선택 가능. 게스트는 비활성. */
  adminMode?: boolean;
  /** 현재 scope 매칭 건수 (옵션) — 'N건' 뱃지 표시 */
  counts?: { all?: number; mine?: number };
  /** 컴팩트 모드(패널 상단용) */
  compact?: boolean;
}

export function ScopeToggle({ adminMode = true, counts, compact = false }: ScopeToggleProps) {
  const scope = useMap2026Store((s) => s.scope);
  const setScope = useMap2026Store((s) => s.setScope);

  const btnBase = compact
    ? 'px-2.5 py-1 text-[11px]'
    : 'px-3 py-1.5 text-[12px]';

  const handleChange = (next: 'all' | 'mine') => {
    if (next === 'mine' && !adminMode) return;
    setScope(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="매물 범위"
      className="inline-flex items-center rounded-lg bg-neutral-100 p-0.5 ring-1 ring-neutral-200"
    >
      <button
        type="button"
        role="radio"
        aria-checked={scope === 'all'}
        onClick={() => handleChange('all')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            handleChange('mine');
          }
        }}
        className={[
          btnBase,
          'rounded-md font-semibold transition',
          scope === 'all'
            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-300'
            : 'text-neutral-600 hover:text-neutral-900',
        ].join(' ')}
      >
        전체
        {typeof counts?.all === 'number' && (
          <span className="ml-1 tabular-nums text-neutral-500">
            {counts.all.toLocaleString()}
          </span>
        )}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={scope === 'mine'}
        aria-disabled={!adminMode}
        title={!adminMode ? '로그인한 중개인만 이용 가능' : undefined}
        onClick={() => handleChange('mine')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            handleChange('all');
          }
        }}
        className={[
          btnBase,
          'rounded-md font-semibold transition',
          !adminMode
            ? 'cursor-not-allowed text-neutral-400'
            : scope === 'mine'
            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-300'
            : 'text-neutral-600 hover:text-neutral-900',
        ].join(' ')}
      >
        내 매물
        {typeof counts?.mine === 'number' && adminMode && (
          <span className="ml-1 tabular-nums text-neutral-500">
            {counts.mine.toLocaleString()}
          </span>
        )}
      </button>
    </div>
  );
}
