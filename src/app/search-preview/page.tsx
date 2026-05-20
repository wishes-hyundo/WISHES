'use client';

/**
 * /search-preview — /search 현대식 재구축 검증 페이지
 *
 * 레거시 /search (content.js + 패치 91개) → 통합 React 재구축.
 * 기준 문서: ★search_완전기능명세서.md (레거시 전 기능 parity 체크리스트).
 *
 * P2 진행: 헤더(배포 완료) + FilterBar(필터 바 — 핵심·상세 필터·적용 칩).
 *   목록/지도/모달/도구는 후속 단계. 인증은 swap 시점에 /search 자체 로직 적용.
 */

import { SearchHeader } from '@/features/search-2026/components/SearchHeader';
import { FilterBar } from '@/features/search-2026/components/FilterBar';
import { useSearchStore } from '@/features/search-2026/store';
import { type SearchView } from '@/features/search-2026/components/ViewTabs';
import { useState } from 'react';

export default function SearchPreviewPage() {
  const [view, setView] = useState<SearchView>('search');
  const { filters } = useSearchStore();
  const activeCount =
    (filters.deals?.length ?? 0) +
    (filters.types?.length ?? 0) +
    (filters.roomCounts?.length ?? 0) +
    (filters.options?.length ?? 0) +
    [filters.roomShape, filters.floorType, filters.livingSize, filters.builtYearMin, filters.parkingMin]
      .filter((v) => v != null).length;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard','Malgun Gothic',sans-serif",
      }}
    >
      <SearchHeader
        query={filters.q ?? ''}
        onQueryChange={() => {}}
        onReset={() => {}}
        onSearch={(v) => console.log('[search-preview] 검색:', v)}
        view={view}
        onViewChange={setView}
      />
      <FilterBar />

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#9398a0', textAlign: 'center', padding: '6px 0 10px' }}>
          ── P2 검증 · 필터 바 (적용된 필터 {activeCount}개) · 목록/지도는 후속 단계 ──
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'flex', gap: 11, alignItems: 'center', background: '#fff',
              borderRadius: 15, padding: 11, boxShadow: '0 1px 3px rgba(0,0,0,.05)',
            }}
          >
            <div style={{ width: 58, height: 58, borderRadius: 11, background: '#e8ece9', flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 9, width: '55%', background: '#1d1d1f', opacity: 0.82, borderRadius: 3 }} />
              <div style={{ height: 7, width: '84%', background: '#e4e5e8', borderRadius: 3, marginTop: 8 }} />
              <div style={{ height: 7, width: '46%', background: '#eef0f1', borderRadius: 3, marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
