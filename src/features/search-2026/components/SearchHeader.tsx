'use client';

/**
 * SearchHeader — /search 재구축 헤더 (P2)
 *
 * iOS 26.5 Liquid Glass 디자인. 대표님 확정 (2026-05-20).
 *   - 반투명 유리(backdrop-blur) 헤더 — 콘텐츠 위에 sticky 로 떠 있음
 *   - 유리 윗면 sheen + specular 윤곽선 + 떠 있는 그림자
 *   - 검색창 = 유리 캡슐 (focus 시 그린 테두리)
 *   - 검색 = 그린 그라데이션 강조 / 초기화 = 유리 캡슐
 *   - 모서리 13px 동심원 · SF Pro/Pretendard 타이포
 * 스타일: SearchHeader.module.css
 */

import { useState } from 'react';
import styles from './SearchHeader.module.css';

export interface SearchHeaderProps {
  /** 검색어 (제어 컴포넌트로 쓸 때) */
  query?: string;
  onQueryChange?: (value: string) => void;
  /** 초기화 버튼 */
  onReset?: () => void;
  /** 검색 버튼 / 입력창 Enter */
  onSearch?: (value: string) => void;
}

export function SearchHeader({ query, onQueryChange, onReset, onSearch }: SearchHeaderProps) {
  const [internal, setInternal] = useState('');
  const isControlled = query !== undefined;
  const value = isControlled ? query : internal;

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onQueryChange?.(v);
  };

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>
        <span className={styles.titleBrand}>WISHES</span>
        <span className={styles.titleSub}> 매물검색</span>
      </h1>

      <div className={styles.searchWrap}>
        <svg
          className={styles.searchIcon}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="5.85" cy="5.85" r="4.35" stroke="#9398a0" strokeWidth="1.6" />
          <line
            x1="9.05"
            y1="9.05"
            x2="12.4"
            y2="12.4"
            stroke="#9398a0"
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
        className={`${styles.btn} ${styles.btnReset}`}
        onClick={onReset}
      >
        초기화
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnSearch}`}
        onClick={() => onSearch?.(value)}
      >
        검색
      </button>
    </header>
  );
}

export default SearchHeader;
