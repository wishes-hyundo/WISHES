'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): ListingGrid — 12,000+ 매물 가상스크롤
//   TanStack Virtual 사용 (Window 가상화 — 보이는 것만 렌더)
//   2026 SOTA 패턴: ResizeObserver로 동적 컬럼 수, container queries
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListingCardBob, type ListingCardBobData } from './ListingCardBob';
import { cn } from '@/lib/utils';

export interface ListingGridProps {
  listings: ListingCardBobData[];
  onCardClick?: (listing: ListingCardBobData) => void;
  onFavoriteToggle?: (id: number) => void;
  className?: string;
  emptyMessage?: string;
  // 카드 크기 (컬럼 수 자동 계산)
  cardMinWidth?: number;
  cardEstimateHeight?: number;
  gap?: number;
}

export function ListingGrid({
  listings,
  onCardClick,
  onFavoriteToggle,
  className,
  emptyMessage = '조건에 맞는 매물이 없습니다.',
  cardMinWidth = 280,
  cardEstimateHeight = 420,
  gap = 16,
}: ListingGridProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [columns, setColumns] = React.useState(1);

  // ResizeObserver로 컨테이너 너비 → 컬럼 수 자동 계산
  React.useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const cols = Math.max(1, Math.floor((w + gap) / (cardMinWidth + gap)));
      setColumns(cols);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardMinWidth, gap]);

  // 가상화: 행 단위 (한 행에 columns 개)
  const rowCount = Math.ceil(listings.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => cardEstimateHeight + gap,
    overscan: 5,
  });

  if (listings.length === 0) {
    return (
      <div className={cn('flex items-center justify-center min-h-[300px] rounded-xl border border-dashed border-wishes-border bg-white text-wishes-muted text-sm', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={parentRef} className={cn('relative overflow-auto', className)} style={{ contain: 'strict' }}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowIdx = virtualRow.index;
          const start = rowIdx * columns;
          const end = Math.min(start + columns, listings.length);
          const items = listings.slice(start, end);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: gap,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${gap}px`,
                }}
              >
                {items.map((listing) => (
                  <ListingCardBob
                    key={listing.id}
                    listing={listing}
                    onClick={onCardClick}
                    onFavoriteToggle={onFavoriteToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
