'use client';

/**
 * ResultsSplit — /search 통합 화면 본문: 목록 + 지도 분할 (P3)
 *
 * 통합 최종안의 핵심 레이아웃. 데스크탑은 좌(목록)·우(지도) 분할,
 * 모바일은 목록 전폭(지도는 토글 — 후속). iOS 앱 톤.
 * 지도는 SearchMap (카카오맵 + 서버 클러스터) 실통합 — P5 완료.
 */

import { useMemo, useState } from 'react';
import { FILTER_OPTIONS, type SearchListing } from '../types';
import { groupByLocation, mergeUnitDeals } from '../format';
import { ListingCard } from './ListingCard';
import { ListingGroup } from './ListingGroup';
import { SearchMap } from './SearchMap';
import styles from './ResultsSplit.module.css';

export interface ResultsSplitProps {
  listings: SearchListing[];
  total: number;
}

export function ResultsSplit({ listings, total }: ResultsSplitProps) {
  const [sort, setSort] = useState('latest');
  const groups = useMemo(() => groupByLocation(mergeUnitDeals(listings)), [listings]);

  return (
    <div className={styles.split}>
      <div className={styles.listCol}>
        <div className={styles.resultHead}>
          <span className={styles.count}>
            검색결과 <strong>{total.toLocaleString()}</strong>건
          </span>
          <select
            className={styles.sortSel}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="정렬"
          >
            {FILTER_OPTIONS.sorts.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.cards}>
          {groups.map((g) =>
            g.listings.length === 1 ? (
              <ListingCard key={g.key} listing={g.listings[0]} />
            ) : (
              <ListingGroup key={g.key} group={g} />
            ),
          )}
        </div>
      </div>

      <div className={styles.mapCol}>
        <div className={styles.map}>
          <SearchMap />
        </div>
      </div>
    </div>
  );
}

export default ResultsSplit;
