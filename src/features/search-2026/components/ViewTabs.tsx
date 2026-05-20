'use client';

/**
 * ViewTabs — /search 뷰 전환 탭 (P2)
 *
 * iOS 세그먼트 컨트롤 + 가는선 아이콘 (B안). 대표님 확정 (2026-05-20).
 *   주소검색 / 지도보기 / 전체보기
 * 스타일: ViewTabs.module.css
 */

import styles from './ViewTabs.module.css';

export type SearchView = 'search' | 'map' | 'all';

interface TabDef {
  id: SearchView;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'search', label: '주소검색' },
  { id: 'map', label: '지도보기' },
  { id: 'all', label: '전체보기' },
];

function TabIcon({ id }: { id: SearchView }) {
  if (id === 'search') {
    return (
      <svg className={styles.icon} width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="5.85" cy="5.85" r="4.35" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9.05" y1="9.05" x2="12.4" y2="12.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'map') {
    return (
      <svg className={styles.icon} width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 2 L1.5 3.5 V12 L5 10.5 L9 12 L12.5 10.5 V2 L9 3.5 L5 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="5" y1="2" x2="5" y2="10.5" stroke="currentColor" strokeWidth="1.4" />
        <line x1="9" y1="3.5" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="2" y1="3.5" x2="12" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export interface ViewTabsProps {
  value?: SearchView;
  onChange?: (view: SearchView) => void;
}

export function ViewTabs({ value = 'search', onChange }: ViewTabsProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.track} role="tablist" aria-label="검색 보기 전환">
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
