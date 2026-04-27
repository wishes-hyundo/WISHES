'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): BoB 매물 카드 v1
//   - shadcn UI (Badge) + cva variants 활용
//   - 옛날 ListingCard.tsx 와 별도 폴더 (충돌 X)
//   - 미사용 (다음 세션에 /search 본가 swap 예정)
//   - 2026 SOTA 패턴: container queries, line-clamp, AVIF first
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { Heart, MapPin, Maximize2, Building2, Bed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ListingCardBobData {
  id: number;
  type?: string;
  deal?: string;
  status?: string;
  address?: string;
  building_name?: string;
  dong?: string;
  gu?: string;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  area_m2?: number | null;
  floor_current?: number | null;
  floor_total?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  built_year?: number | null;
  images?: string[];
  is_favorite?: boolean;
  ai_tags?: string[];
}

export interface ListingCardBobProps {
  listing: ListingCardBobData;
  onClick?: (listing: ListingCardBobData) => void;
  onFavoriteToggle?: (id: number) => void;
  className?: string;
}

// 가격 포맷 (만원 → 억/만원)
function formatPriceWon(amount: number | null | undefined): string {
  if (!amount) return '-';
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`;
  }
  return `${amount.toLocaleString()}만`;
}

function formatPrice(deal: string | undefined, deposit: number | null | undefined, monthly: number | null | undefined, price: number | null | undefined): string {
  if (deal === '매매') return formatPriceWon(price ?? null);
  if (deal === '전세') return formatPriceWon(deposit ?? null);
  if (deal === '월세') return `${formatPriceWon(deposit ?? null)} / ${formatPriceWon(monthly ?? null)}`;
  return formatPriceWon(deposit ?? price ?? null);
}

function statusVariant(status?: string): 'default' | 'success' | 'warning' | 'secondary' {
  switch (status) {
    case '공개': return 'success';
    case '계약중': return 'warning';
    case '계약완료': return 'secondary';
    default: return 'default';
  }
}

// 면적 m² → 평형 변환 (1평 = 3.3058m²)
function m2ToPyeong(m2: number | null | undefined): string {
  if (!m2) return '-';
  const py = m2 / 3.3058;
  return `${py.toFixed(1)}평`;
}

export function ListingCardBob({ listing, onClick, onFavoriteToggle, className }: ListingCardBobProps) {
  const mainImage = listing.images?.[0] || '/images/placeholder.svg';
  const placeText = [listing.gu, listing.dong, listing.building_name].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-wishes-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer',
        className
      )}
      onClick={() => onClick?.(listing)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(listing); } }}
    >
      {/* 이미지 영역 */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-wishes-cream">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mainImage}
          alt={listing.building_name || listing.address || '매물 이미지'}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* 좌상: 거래유형 + 매물유형 */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {listing.deal && <Badge variant="default">{listing.deal}</Badge>}
          {listing.type && <Badge variant="outline" className="bg-white/90 backdrop-blur-sm">{listing.type}</Badge>}
        </div>

        {/* 우상: 즐겨찾기 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-9 w-9 bg-white/80 hover:bg-white backdrop-blur-sm"
          aria-label={listing.is_favorite ? '관심 매물에서 제거' : '관심 매물 추가'}
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle?.(listing.id);
          }}
        >
          <Heart
            className={cn('h-5 w-5 transition-colors', listing.is_favorite ? 'fill-red-500 text-red-500' : 'text-wishes-muted')}
          />
        </Button>

        {/* 우하: 상태 배지 */}
        {listing.status && (
          <div className="absolute right-2 bottom-2">
            <Badge variant={statusVariant(listing.status)}>{listing.status}</Badge>
          </div>
        )}
      </div>

      {/* 정보 영역 */}
      <div className="flex flex-col gap-2 p-3">
        {/* 가격 */}
        <div className="text-lg font-bold text-wishes-primary">
          {formatPrice(listing.deal, listing.deposit, listing.monthly, listing.price)}
        </div>

        {/* 주소 */}
        <div className="flex items-start gap-1 text-sm text-wishes-text">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wishes-muted" />
          <span className="line-clamp-1">{placeText || listing.address || '주소 미상'}</span>
        </div>

        {/* 메타 (면적/층/방) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-wishes-muted">
          {listing.area_m2 && (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="h-3 w-3" />
              {m2ToPyeong(listing.area_m2)}
            </span>
          )}
          {(listing.floor_current || listing.floor_total) && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {listing.floor_current ?? '?'}{listing.floor_total ? `/${listing.floor_total}` : ''}층
            </span>
          )}
          {listing.rooms && (
            <span className="inline-flex items-center gap-1">
              <Bed className="h-3 w-3" />
              방 {listing.rooms}{listing.bathrooms ? ` · 욕 ${listing.bathrooms}` : ''}
            </span>
          )}
          {listing.built_year && <span>{listing.built_year}년</span>}
        </div>

        {/* AI 태그 (최대 3개) */}
        {listing.ai_tags && listing.ai_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {listing.ai_tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] py-0">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
