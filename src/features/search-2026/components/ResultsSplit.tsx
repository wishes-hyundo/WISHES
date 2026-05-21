'use client';

/**
 * ResultsSplit — /search 통합 화면 본문: 목록 + 지도 분할 (P3 / P5)
 *
 * 데스크탑 좌(목록 44%)·우(지도 56%) 분할. iOS 앱 톤.
 *   · 목록은 TanStack Virtual(window 가상화) — 7.3만건도 DOM 수십개만 유지.
 *   · 끝까지 스크롤하면 onLoadMore 로 다음 페이지 무한 로드.
 *   · 지도는 SearchMap (카카오맵 + 줌단계 폴리곤/클러스터).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { FILTER_OPTIONS, type SearchListing } from '../types';
import { groupByLocation, mergeUnitDeals } from '../format';
import { ListingCard } from './ListingCard';
import { ListingGroup } from './ListingGroup';
import { SearchMap } from './SearchMap';
import { SearchDetailModal } from './SearchDetailModal';
import { SearchActionBar } from './SearchActionBar';
import { SearchCompareModal } from './SearchCompareModal';
import { SearchFavoritesModal } from './SearchFavoritesModal';
import { SearchBriefingModal } from './SearchBriefingModal';
import styles from './ResultsSplit.module.css';

export interface ResultsSplitProps {
  listings: SearchListing[];
  total: number;
  /** 무한 스크롤 — 끝 근처에서 호출. 미지정 시 가상화만(추가로드 없음). */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function ResultsSplit({ listings, total, onLoadMore, hasMore, loadingMore }: ResultsSplitProps) {
  const [sort, setSort] = useState('latest');
  const groups = useMemo(() => groupByLocation(mergeUnitDeals(listings)), [listings]);
  const listRef = useRef<HTMLDivElement>(null);
  const [detailListing, setDetailListing] = useState<SearchListing | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const openListing = (l: SearchListing) => { setDetailListing(l); setDetailId(null); };
  const openById = (mid: number) => { setDetailId(mid); setDetailListing(null); };
  const closeDetail = () => { setDetailListing(null); setDetailId(null); };
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [favMap, setFavMap] = useState<Map<number, SearchListing>>(() => new Map());
  const [favOpen, setFavOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const virt = useWindowVirtualizer({
    count: groups.length,
    estimateSize: () => 132,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  const vItems = virt.getVirtualItems();
  const scrollMargin = virt.options.scrollMargin ?? 0;

  // 무한 스크롤 — 마지막 그룹 근처 도달 시 다음 페이지
  useEffect(() => {
    const last = vItems[vItems.length - 1];
    if (last && last.index >= groups.length - 4 && hasMore && !loadingMore) {
      onLoadMore?.();
    }
  }, [vItems, groups.length, hasMore, loadingMore, onLoadMore]);

  const flatListings = useMemo(() => groups.flatMap((g) => g.listings), [groups]);
  const selectedListings = flatListings.filter((l) => selectedIds.has(l.id));
  const allSelected = flatListings.length > 0
    && selectedListings.length === flatListings.length;
  const toggleAll = () => setSelectedIds(
    allSelected ? new Set() : new Set(flatListings.map((l) => l.id)),
  );

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

        <div ref={listRef} className={styles.cards} style={{ height: virt.getTotalSize() }}>
          {vItems.map((vi) => {
            const g = groups[vi.index];
            if (!g) return null;
            return (
              <div
                key={g.key}
                data-index={vi.index}
                ref={virt.measureElement}
                className={styles.vrow}
                style={{ transform: `translateY(${vi.start - scrollMargin}px)` }}
              >
                {g.listings.length === 1 ? (
                  <ListingCard
                    listing={g.listings[0]}
                    onClick={openListing}
                    selected={selectedIds.has(g.listings[0].id)}
                    onToggleSelect={toggleSelect}
                  />
                ) : (
                  <ListingGroup
                    group={g}
                    onCardClick={openListing}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                )}
              </div>
            );
          })}
        </div>
        {loadingMore && <div className={styles.loadingMore}>매물 더 불러오는 중…</div>}
      </div>

      <div className={styles.mapCol}>
        <div className={styles.map}>
          <SearchMap onSelectListing={openById} />
        </div>
      </div>

      <SearchDetailModal
        listing={detailListing}
        id={detailId}
        onClose={closeDetail}
        pool={flatListings}
        onOpenListing={openListing}
      />

      <SearchActionBar
        selected={selectedListings}
        totalVisible={total}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelectedIds(new Set())}
        onCompare={() => setCompareOpen(true)}
        favCount={favMap.size}
        onAddFav={() => setFavMap((prev) => {
          const m = new Map(prev);
          selectedListings.forEach((l) => m.set(l.id, l));
          return m;
        })}
        onOpenFav={() => setFavOpen(true)}
        onBriefing={() => setBriefingOpen(true)}
      />
      {compareOpen && (
        <SearchCompareModal
          listings={selectedListings}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {briefingOpen && (
        <SearchBriefingModal
          listings={selectedListings}
          onClose={() => setBriefingOpen(false)}
        />
      )}
      {favOpen && (
        <SearchFavoritesModal
          listings={[...favMap.values()]}
          onClose={() => setFavOpen(false)}
          onRemove={(id) => setFavMap((prev) => {
            const m = new Map(prev);
            m.delete(id);
            return m;
          })}
        />
      )}
    </div>
  );
}

export default ResultsSplit;
