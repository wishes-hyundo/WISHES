'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): ListingGrid — 단순 CSS Grid 버전
//   원래 TanStack Virtual 사용 → 빌드 13분 hang (이전 19분 OOM 패턴 재현).
//   임시로 단순 grid 로 (가상화 없음). 12K 매물 한꺼번에 렌더 — 느릴 수 있음.
//   다음: 가상화는 별도 wrapper (dynamic import) 로 분리.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { ListingCardBob, type ListingCardBobData } from './ListingCardBob';
import { cn } from '@/lib/utils';

export interface ListingGridProps {
  listings: ListingCardBobData[];
  onCardClick?: (listing: ListingCardBobData) => void;
  onFavoriteToggle?: (id: number) => void;
  className?: string;
  emptyMessage?: string;
}

export function ListingGrid({
  listings,
  onCardClick,
  onFavoriteToggle,
  className,
  emptyMessage = '조건에 맞는 매물이 없습니다.',
}: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <div className={cn('flex items-center justify-center min-h-[300px] rounded-xl border border-dashed border-wishes-border bg-white text-wishes-muted text-sm', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4', className)}>
      {listings.map((listing) => (
        <ListingCardBob
          key={listing.id}
          listing={listing}
          onClick={onCardClick}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </div>
  );
}
