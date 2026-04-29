/**
 * Phase 2 (2026-04-28): 옛날 /search 헤더 픽셀 재현 (content.js 라인 분석 기반)
 *
 * 출처: _PHASE2_UI_ANALYSIS_2026-04-28.md §A-1
 * - 그래디언트 135deg #2D5A27 → #1a3d18
 * - flex flex-wrap, gap 10px
 * - 모바일 ≤768px: 풀 너비 검색박스 (줄바꿈)
 * - WCAG 터치 타겟 44px 보장
 *
 * 사용처: /search-preview (Owner only 검증). 사장님 검증 후 옛날 /search 와 swap.
 */

'use client';

import { useCallback } from 'react';

type SearchHeaderProps = {
  /** 검색어 (controlled) */
  query: string;
  onQueryChange: (q: string) => void;
  /** scope 토글: 'mine' = 내 매물, 'all' = 전체 */
  scope: 'mine' | 'all';
  onScopeChange: (s: 'mine' | 'all') => void;
  /** 정렬 (옵션) */
  sortValue?: string;
  onSortChange?: (s: string) => void;
  /** 알림 갯수 (🔔 배지) */
  alertCount?: number;
  onAlertClick?: () => void;
  /** 새로고침 */
  onRefresh?: () => void;
  /** 매물 등록 */
  onNewListing?: () => void;
  /** 로그아웃 */
  onLogout?: () => void;
  /** BoB 버전 표시 */
  versionLabel?: string;
};

export function SearchHeader({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  sortValue = 'created_desc',
  onSortChange,
  alertCount = 0,
  onAlertClick,
  onRefresh,
  onNewListing,
  onLogout,
  versionLabel = 'v2',
}: SearchHeaderProps) {
  const handleQuery = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value),
    [onQueryChange]
  );

  return (
    <header
      className="ws-header flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-white max-md:px-3"
      style={{
        background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)',
        minHeight: 44,
      }}
    >
      {/* 제목 + 버전 */}
      <div className="flex items-center gap-2 max-md:text-base">
        <h1 className="text-[18px] font-bold whitespace-nowrap max-md:text-[16px]">
          위시스 중개사 포털
        </h1>
        <span
          className="text-[10px] font-semibold rounded px-1.5 py-0.5"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          BoB {versionLabel}
        </span>
      </div>

      {/* Scope 토글 */}
      <div
        className="ws-scope-toggle flex rounded overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.12)' }}
        role="tablist"
        aria-label="매물 범위"
      >
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'mine'}
          onClick={() => onScopeChange('mine')}
          className="px-3 py-1.5 text-[12px] font-semibold transition"
          style={{
            background: scope === 'mine' ? 'rgba(255,255,255,0.25)' : 'transparent',
          }}
        >
          내 매물
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          onClick={() => onScopeChange('all')}
          className="px-3 py-1.5 text-[12px] font-semibold transition"
          style={{
            background: scope === 'all' ? 'rgba(255,255,255,0.25)' : 'transparent',
          }}
        >
          전체
        </button>
      </div>

      {/* 정렬 */}
      {onSortChange && (
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className="ws-sort px-2 py-1 text-[12px] rounded border-0 outline-none cursor-pointer"
          style={{
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
          }}
          aria-label="정렬 기준"
        >
          <option value="created_desc" style={{ color: '#222' }}>
            최신순
          </option>
          <option value="price_asc" style={{ color: '#222' }}>
            가격 낮은순
          </option>
          <option value="price_desc" style={{ color: '#222' }}>
            가격 높은순
          </option>
          <option value="area_asc" style={{ color: '#222' }}>
            면적 작은순
          </option>
          <option value="area_desc" style={{ color: '#222' }}>
            면적 큰순
          </option>
        </select>
      )}

      {/* 글로벌 검색 */}
      <input
        type="search"
        value={query}
        onChange={handleQuery}
        placeholder="주소·건물·키워드 검색"
        aria-label="매물 검색"
        className="ws-global-search flex-1 min-w-[200px] max-md:flex-[1_1_100%] px-3 py-1.5 text-[13px] max-md:text-[16px] rounded-md outline-none border-0"
        style={{
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
        }}
      />

      {/* 우측 버튼들 */}
      <div className="ws-header-buttons flex items-center gap-1.5">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="새로고침"
            className="px-2.5 py-1.5 text-[12px] rounded transition"
            style={{
              background: 'rgba(255,255,255,0.15)',
              minHeight: 32,
              minWidth: 44,
            }}
          >
            🔄
          </button>
        )}
        {onNewListing && (
          <button
            type="button"
            onClick={onNewListing}
            className="px-3 py-1.5 text-[12px] font-semibold rounded transition whitespace-nowrap"
            style={{
              background: 'rgba(255,255,255,0.22)',
              minHeight: 32,
            }}
          >
            + 매물등록
          </button>
        )}
        {onAlertClick && (
          <button
            type="button"
            onClick={onAlertClick}
            aria-label={`알림 ${alertCount}건`}
            className="relative px-2.5 py-1.5 text-[12px] rounded transition"
            style={{
              background: 'rgba(255,255,255,0.15)',
              minHeight: 32,
              minWidth: 44,
            }}
          >
            🔔
            {alertCount > 0 && (
              <span
                className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full px-1.5"
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  minWidth: 18,
                  lineHeight: '18px',
                }}
              >
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
        )}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 text-[12px] rounded transition whitespace-nowrap"
            style={{
              background: 'rgba(255,255,255,0.12)',
              minHeight: 32,
            }}
          >
            로그아웃
          </button>
        )}
      </div>
    </header>
  );
}

export default SearchHeader;
