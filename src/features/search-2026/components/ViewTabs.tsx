'use client';

/**
 * ViewTabs — /search 통합 화면 레이아웃 토글 (P2)
 *
 * 통합 화면 확정(2026-05-21): 레거시 3-탭(주소검색/지도보기/전체보기)은 폐기.
 * 한 화면에 목록+지도를 같이 두고, 토글은 레이아웃 전환만 한다.
 *   · 분할 — 목록 + 지도 동시 (데스크탑 기본)
 *   · 지도 — 지도 위주 (모바일에서 목록 ⇄ 지도 전환에도 사용)
 * 스타일: ViewTabs.module.css
 */

import styles from './ViewTabs.module.css';

export type SearchView = 'split' | 'map';

interface TabDef {
  id: SearchView;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'split', label: '분할' },
  { id: 'map', label: '지도' },
];

function TabIcon({ id }: { id: SearchView }) {
  if (id === 'split') {
    return (
      <svg className={styles.icon} width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1.5" y="2.2" width="11" height="9.6" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <line x1="7" y1="2.2" x2="7" y2="11.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 2 L1.5 3.5 V12 L5 10.5 L9 12 L12.5 10.5 V2 L9 3.5 L5 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="5" y1="2" x2="5" y2="10.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="9" y1="3.5" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export interface ViewTabsProps {
  value?: SearchView;
  onChange?: (view: SearchView) => void;
}

export function ViewTabs({ value = 'split', onChange }: ViewTabsProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.track} role="tablist" aria-label="화면 레이아웃 전환">
        {TABS.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? `${styles.seg} ${styles.segActive}` : styles.seg}
              onClick={() => onChange?.(t.id)}
            >
              <TabIcon id={t.id} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ViewTabs;
