// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MiniCard — hover 시 떠오르는 작은 카드 (v3 통일, L-minicard1 2026-04-23 p.m.)
//
// 이전: 지역/현재뷰 deviation 듀얼 배지 등 분석-중심 요약
// 이번: /map 카드·슬라이드 패널과 같은 비주얼 언어로 통일
//   · 상단 배지 row: [NEW][월세] {단지명/업종/타입}
//   · 가격 (prominent)
//   · 메타 1줄: 타입 · 면적 · 층 · 방향
//   · 연식 + 타입별 chip
//   · 확인매물 날짜 (updated_at)
// 폭 256px 유지 (뷰포트 clamp 유틸 재사용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store, type MapListing } from '../store';
import { formatDealLabel, formatArea } from '../lib/priceFormat';
import { buildListingBadges } from '../lib/buildAgeBadge';

const CARD_W = 256;
const CARD_H = 180;

function clampPos(x: number, y: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: x + 12, top: y + 12 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = x + 12 + CARD_W > vw - 8;
  const bottom = y + 12 + CARD_H > vh - 8;
  const left = right ? Math.max(8, x - 12 - CARD_W) : x + 12;
  const top = bottom ? Math.max(8, y - 12 - CARD_H) : y + 12;
  return { left, top };
}

function formatFloorPair(cur: string | null | undefined, total: string | null | undefined): string | null {
  if (cur == null) return null;
  const c = String(cur).trim();
  if (!c || c === '-') return null;
  const isNum = /^\d+$/.test(c);
  const t = total ? String(total).trim() : '';
  if (isNum && t && /^\d+$/.test(t)) return `${c}/${t}층`;
  if (isNum) return `${c}층`;
  return c;
}

function typeSpecificChip(l: MapListing): string | null {
  if (l.full_option) return '풀옵션';
  if (l.pet) return '반려동물';
  if (l.elevator) return '엘리베이터';
  if (l.parking && l.parking !== '불가능' && l.parking !== '없음') return '주차가능';
  return null;
}

const AGE_TONE_CLASS: Record<string, string> = {
  newest:  'bg-emerald-50 text-emerald-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber:   'bg-amber-50 text-amber-700',
  gray:    'bg-neutral-100 text-neutral-600',
};

export function MiniCard() {
  const listing = useMap2026Store((s) => s.hoveredListing);
  const pos = useMap2026Store((s) => s.hoverPos);

  if (!listing || !pos) return null;

  const { isNew, age } = buildListingBadges({
    built_year: listing.built_year,
    created_at: listing.created_at,
  });
  const floorLabel = formatFloorPair(listing.floor_current, listing.floor_total);
  const areaShort = listing.area_m2 && listing.area_m2 >= 5 ? formatArea(listing.area_m2) : null;
  const metaParts: string[] = [];
  if (listing.type) metaParts.push(listing.type);
  if (areaShort) metaParts.push(areaShort);
  if (floorLabel) metaParts.push(floorLabel);
  if (listing.direction) metaParts.push(listing.direction);
  const typeChip = typeSpecificChip(listing);
  const clamped = clampPos(pos.x, pos.y);

  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl"
      style={{ left: clamped.left, top: clamped.top }}
    >
      {/* Row 1 — NEW + 거래 + 단지명/업종/타입 */}
      <div className="mb-1.5 flex items-center gap-1 min-w-0">
        {isNew && (
          <span className="shrink-0 rounded bg-rose-600 px-1.5 py-[2px] text-[10px] font-bold text-white leading-[1.2]">
            NEW
          </span>
        )}
        <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white leading-[1.3]">
          {listing.deal}
        </span>
        {(listing.building_name || listing.business_type || listing.type) && (
          <span className="min-w-0 truncate text-[11px] font-medium text-neutral-700">
            {listing.building_name || listing.business_type || listing.type}
          </span>
        )}
      </div>

      {/* 가격 */}
      <div className="text-[18px] font-bold leading-tight text-neutral-900">
        {formatDealLabel(listing)}
      </div>

      {/* 메타 */}
      {metaParts.length > 0 && (
        <div className="mt-0.5 truncate text-[11.5px] text-neutral-600">
          {metaParts.join(' · ')}
        </div>
      )}

      {/* 연식 + 타입 chip */}
      {(age || typeChip) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {age && (
            <span className={[
              'rounded px-1.5 py-[2px] text-[10px] font-bold leading-[1.2]',
              AGE_TONE_CLASS[age.tone] ?? AGE_TONE_CLASS.gray,
            ].join(' ')}>
              {age.text}
            </span>
          )}
          {typeChip && (
            <span className="rounded bg-neutral-100 px-1.5 py-[2px] text-[10px] font-medium text-neutral-600 leading-[1.2]">
              {typeChip}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
