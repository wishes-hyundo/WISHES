'use client';

/**
 * ResultsSplit — /search 통합 화면 본문: 목록 + 지도 분할 (P3)
 *
 * 통합 최종안의 핵심 레이아웃. 데스크탑은 좌(목록)·우(지도) 분할,
 * 모바일은 목록 전폭(지도는 토글 — 후속). iOS 앱 톤.
 * 지도는 카카오맵 클러스터 통합 예정 — 현재는 스타일 플레이스홀더.
 */

import { useMemo, useState } from 'react';
import { FILTER_OPTIONS, type SearchListing } from '../types';
import { groupByLocation, mergeUnitDeals } from '../format';
import { ListingCard } from './ListingCard';
import { ListingGroup } from './ListingGroup';
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
          <div className={styles.mapGridLine} style={{ top: '24%' }} />
          <div className={styles.mapGridLine} style={{ top: '62%' }} />
          <div className={styles.mapRoad} />
          <div className={styles.cluster} style={{ left: '22%', top: '30%', width: 44, height: 44 }}>128</div>
          <div className={styles.cluster} style={{ left: '58%', top: '46%', width: 34, height: 34 }}>45</div>
          <div className={styles.cluster} style={{ left: '38%', top: '70%', width: 28, height: 28 }}>9</div>
          <div className={styles.cluster} style={{ left: '70%', top: '74%', width: 38, height: 38 }}>73</div>
          <div className={styles.mapNote}>지도 — 카카오맵 클러스터 통합 예정 (다음 단계)</div>
        </div>
      </div>
    </div>
  );
}

export default ResultsSplit;
