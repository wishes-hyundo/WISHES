// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VirtualListingList — TanStack Virtual 기반 가상 스크롤 리스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 10만 매물이 뷰포트 안에 들어와도 DOM 노드는 실제 화면에 보이는 ~10개만 생성.
//   - 가변 높이 대응 (measureElement)
//   - overscan 5 (스크롤 방향 프리렌더)
//   - scrollToIndex 지원 (지도 마커 클릭 시 리스트 포커스 연동)
//
// 사용:
//   <VirtualListingList listings={items} onCardClick={(l)=>...} focusId={hoveredId} />

'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';

interface Props {
  listings: Listing[];
  onCardClick?: (l: Listing) => void;
  onCardHover?: (l: Listing | null) => void;
  focusId?: number | null;
  /** 개별 카드 높이 추정치 (px). 기본 160px. */
  estimateSize?: number;
  className?: string;
}

export default function VirtualListingList({
  listings,
  onCardClick,
  onCardHover,
  focusId,
  estimateSize = 160,
  className = '',
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: listings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
    measureElement:
      typeof ResizeObserver !== 'undefined'
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  // focusId 변경 시 해당 카드 위치로 스크롤
  useEffect(() => {
    if (focusId == null) return;
    const idx = listings.findIndex((l) => l.id === focusId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
  }, [focusId, listings, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  const total = virtualizer.getTotalSize();

  // 공백 상태 메모 (리스트 0건)
  const empty = useMemo(() => listings.length === 0, [listings.length]);

  if (empty) {
    return (
      <div className={`flex h-full items-center justify-center text-sm text-wishes-text-muted ${className}`}>
        조건에 맞는 매물이 없습니다
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`h-full overflow-y-auto overscroll-contain ${className}`}
      style={{ contain: 'strict' }}
    >
      <div style={{ height: total, width: '100%', position: 'relative' }}>
        {virtualItems.map((v) => {
          const listing = listings[v.index];
          if (!listing) return null;
          return (
            <div
              key={listing.id}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${v.start}px)`,
              }}
              className={`px-3 py-2 transition-transform ${
                focusId === listing.id ? 'ring-2 ring-indigo-500 rounded-xl' : ''
              }`}
              onMouseEnter={() => onCardHover?.(listing)}
              onMouseLeave={() => onCardHover?.(null)}
              onClick={() => onCardClick?.(listing)}
            >
              <ListingCard listing={listing} compact />
            </div>
          );
        })}
      </div>
    </div>
  );
}
