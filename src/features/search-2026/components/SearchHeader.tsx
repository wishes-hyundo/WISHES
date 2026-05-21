'use client';

/**
 * SearchHeader — /search 재구축 헤더 (P2)
 *
 * iOS 26.5 Liquid Glass 컴팩트 툴바. 대표님 확정 (2026-05-21).
 *   WISHES 워드마크 · 뷰 전환 세그먼트(ViewTabs) · 유리 검색 캡슐
 *   · 둥근 유리 아이콘 버튼(초기화 ↺ / 검색 ⌕)
 *
 * 배치 — B안 (대표님 확정 2026-05-21): 검색 캡슐 옆에 초기화·검색 버튼이
 *   나란히 동행. 데스크탑은 1줄, 모바일은 [로고] / [검색+버튼] / [세그먼트]
 *   3줄로 자동 적층. 2026 최신폰~구형폰(320px) 모두 안전.
 *
 * 스타일: SearchHeader.module.css
 */

import { useState } from 'react';
import styles from './SearchHeader.module.css';
import { ViewTabs, type SearchView } from './ViewTabs';

export interface SearchHeaderProps {
  query?: string;
  onQueryChange?: (value: string) => void;
  onReset?: () => void;
  onSearch?: (value: string) => void;
  view?: SearchView;
  onViewChange?: (view: SearchView) => void;
}

export function SearchHeader({
  query,
  onQueryChange,
  onReset,
  onSearch,
  view,
  onViewChange,
}: SearchHeaderProps) {
  const [internal, setInternal] = useState('');
  const isControlled = query !== undefined;
  const value = isControlled ? query : internal;

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onQueryChange?.(v);
  };

  return (
    <header className={styles.header}>
      <span className={styles.brand}>WISHES</span>

      <div className={styles.tabs}>
        <ViewTabs value={view} onChange={onViewChange} />
      </div>

      <div className={styles.searchGroup}>
        <div className={styles.searchWrap}>
          <svg
            className={styles.searchIcon}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="5.85" cy="5.85" r="4.35" stroke="#83878f" strokeWidth="1.6" />
            <line
              x1="9.05"
              y1="9.05"
              x2="12.4"
              y2="12.4"
              stroke="#83878f"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="검색어를 입력하세요"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch?.(value);
            }}
          />
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          aria-label="초기화"
          onClick={() => {
            // 비제어 모드일 때 내부 입력 상태도 함께 비움
            if (!isControlled) setInternal('');
            onReset?.();
          }}
        >
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M11.4 7A4.4 4.4 0 1 1 9.7 3.5"
              stroke="#56606a"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M9.5 0.8 L10 3.9 L7 3.4"
              stroke="#56606a"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
          aria-label="검색"
          onClick={() => onSearch?.(value)}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="5.85" cy="5.85" r="4.35" stroke="#fff" strokeWidth="1.75" />
            <line
              x1="9.05"
              y1="9.05"
              x2="12.4"
              y2="12.4"
              stroke="#fff"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default SearchHeader;
