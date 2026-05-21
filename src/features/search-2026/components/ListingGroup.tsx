'use client';

/**
 * ListingGroup — 소재지 묶음 (P3 §3-2)
 *
 * 같은 시/도+구+동에서 지번 또는 건물명이 일치하는 매물을 한 묶음으로.
 * 헤더(소재지 + N건) 클릭으로 접기/펼치기. 개수 제한 없음.
 */

import { useState } from 'react';
import type { LocationGroup } from '../format';
import type { SearchListing } from '../types';
import { ListingCard } from './ListingCard';
import styles from './ListingGroup.module.css';

export function ListingGroup({
  group,
  onCardClick,
  selectedIds,
  onToggleSelect,
}: {
  group: LocationGroup;
  onCardClick?: (listing: SearchListing) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={open ? `${styles.caret} ${styles.caretOpen}` : styles.caret} aria-hidden="true">▸</span>
        <span className={styles.label}>{group.label}</span>
        <span className={styles.count}>{group.listings.length}건</span>
      </button>
      {open && (
        <div className={styles.cards}>
          {group.listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onClick={onCardClick}
              selected={selectedIds?.has(l.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ListingGroup;
