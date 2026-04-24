// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListPanel — /map 좌측 매물 리스트 (네이버 스타일 v3)
//
// L-card3 (2026-04-23 p.m.): v3 목업 확정 후 카드 재구성
//   · 상단 배지: [거래방식] (업무용이면 + business_type). 매물번호·저렴% 제거
//   · 가격 (17px semibold)
//   · 메타 1줄 truncate: 타입 · 공급/전용㎡ · 해당층/총층 · 방향
//   · 제목 1줄 truncate (ai_title. 없으면 skip — 빈 공간 삭제)
//   · 연식 + 타입별 1 chip (가로 나열, 최대 3개, wrap 허용)
//   · 확인매물 날짜 (updated_at) — 카드 하단 고정
//   · 썸네일 108px 우측 align-self: stretch 로 텍스트 높이 매칭
//
// 정렬 tiebreaker (L-photosort1):
//   · 모든 정렬 case 에서 thumbnail_url NOT NULL 매물 우선
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Image from 'next/image';
import { MapPin, Image as ImageIcon, Video } from 'lucide-react';
import { useMap2026Store, type MapListing, type SortKey } from '../store';
import { formatDealLabel, formatArea } from '../lib/priceFormat';
import { buildListingBadges } from '../lib/buildAgeBadge';
import { SortMenu } from './SortMenu';

// 층 포맷: "3" → "3/8층" (floor_total 있으면) / "3층"
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

// 타입별 대표 1 chip — 주거: 풀옵션/반려동물/엘리베이터 / 상가: 주차/엘리베이터 / 토지: —
function typeSpecificChip(l: MapListing): string | null {
  if (l.full_option) return '풀옵션';
  if (l.pet) return '반려동물';
  if (l.elevator) return '엘리베이터';
  if (l.parking && l.parking !== '불가능' && l.parking !== '없음') return '주차가능';
  return null;
}

function photoRank(l: MapListing): number {
  // thumbnail_url 있는 매물을 상위로 올림 (primary sort 가 동점일 때 tiebreaker)
  return l.thumbnail_url ? 0 : 1;
}

function sortListings(list: MapListing[], sort: SortKey): MapListing[] {
  const copy = [...list];
  const tieBreak = (a: MapListing, b: MapListing) => photoRank(a) - photoRank(b);
  switch (sort) {
    case 'recent':
      copy.sort((a, b) => {
        const d = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return d !== 0 ? d : tieBreak(a, b);
      });
      break;
    case 'price_asc':
      copy.sort((a, b) => {
        const d =
          (a.price ?? a.deposit ?? a.monthly ?? Number.MAX_SAFE_INTEGER) -
          (b.price ?? b.deposit ?? b.monthly ?? Number.MAX_SAFE_INTEGER);
        return d !== 0 ? d : tieBreak(a, b);
      });
      break;
    case 'price_desc':
      copy.sort((a, b) => {
        const d =
          (b.price ?? b.deposit ?? b.monthly ?? -1) -
          (a.price ?? a.deposit ?? a.monthly ?? -1);
        return d !== 0 ? d : tieBreak(a, b);
      });
      break;
    case 'area_desc':
      copy.sort((a, b) => {
        const d = (b.area_m2 ?? 0) - (a.area_m2 ?? 0);
        return d !== 0 ? d : tieBreak(a, b);
      });
      break;
    case 'deal_score':
      copy.sort((a, b) => {
        const d = (b.hero_score ?? 0) - (a.hero_score ?? 0);
        return d !== 0 ? d : tieBreak(a, b);
      });
      break;
  }
  return copy;
}

// 확인매물 날짜 포맷: "26.04.22"
function formatCheckedDate(updated_at: string | null | undefined): string | null {
  if (!updated_at) return null;
  const d = new Date(updated_at);
  if (Number.isNaN(d.getTime())) return null;
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

const AGE_TONE_CLASS: Record<string, string> = {
  newest:  'bg-emerald-50 text-emerald-700',    // 5년 이내 (YYYY년 준공)
  emerald: 'bg-emerald-50 text-emerald-700',    // 10년이내
  amber:   'bg-amber-50 text-amber-700',        // 15년이내
  gray:    'bg-neutral-100 text-neutral-600',   // 25년이내
};

export function ListPanel() {
  const listings = useMap2026Store((s) => s.listings);
  const loading = useMap2026Store((s) => s.loading);
  const sort = useMap2026Store((s) => s.sort);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);

  const sorted = useMemo(() => sortListings(listings, sort), [listings, sort]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // L-cardheight1 (2026-04-23 p.m.): 카드 높이 고정으로 virtualizer 위치 충돌 해소.
  //   가변 높이일 때 measureElement 가 rAF 한 틱 뒤 측정 → 그 동안 translateY
  //   겹침 → "확인매물" 텍스트가 다른 카드와 겹쳐 보이던 버그.
  //   전부 160px 로 통일 (배지 2줄 + 제목 + 연식 + 날짜 수용).
  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    // measureElement 제거 — 고정 높이 사용
  });

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-bold text-neutral-900">
            {loading ? '검색 중…' : `${sorted.length.toLocaleString()}개`}
          </span>
          <span className="text-[11.5px] text-neutral-500">매물</span>
        </div>
        <SortMenu />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sorted.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-neutral-400">
            <MapPin className="size-8 opacity-50" />
            <div className="text-[13px]">이 영역에 매물이 없습니다</div>
            <div className="text-[11.5px]">지도를 움직이거나 필터를 조정해 보세요</div>
          </div>
        )}

        {sorted.length > 0 && (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const l = sorted[vRow.index];
              const active = selectedId === l.id;
              const { isNew, age } = buildListingBadges({
                built_year: l.built_year,
                created_at: l.created_at,
              });

              const floorLabel = formatFloorPair(l.floor_current, l.floor_total);
              const areaShort = l.area_m2 && l.area_m2 > 0 ? formatArea(l.area_m2) : null;

              // 메타 1줄: 타입 · 면적 · 층 · 방향 (존재하는 것만 · 로 이음)
              const metaParts: string[] = [];
              if (l.type) metaParts.push(l.type);
              if (areaShort) metaParts.push(areaShort);
              if (floorLabel) metaParts.push(floorLabel);
              if (l.direction) metaParts.push(l.direction);

              const typeChip = typeSpecificChip(l);
              const checkDate = formatCheckedDate(l.updated_at);

              return (
                <button
                  key={l.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={vRow.index}
                  onClick={() => openListingDetail(l.id)}
                  className={[
                    'flex w-full items-stretch gap-3 overflow-hidden border-b border-neutral-50 px-3 py-3 text-left transition',
                    active
                      ? 'bg-emerald-50 border-l-[3px] border-l-emerald-600 pl-[9px]'
                      : 'hover:bg-neutral-50',
                  ].join(' ')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '160px',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* L-card4 (2026-04-23 p.m.): Row 1 재구성
                     *   · NEW 를 거래방식 좌측으로 이동 (네이버 패턴)
                     *   · 우측에 단지명/건물명 (로그인 시만 제공됨 — building_name 이 null 이면 type 로 폴백)
                     *   · 업종(business_type) 은 단지명 없을 때만 대체 노출
                     *   · L-cardheight1: flex-nowrap + overflow-hidden — 고정 높이 내 clip */}
                    <div className="flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden">
                      {isNew && (
                        <span className="shrink-0 rounded bg-amber-400 px-1.5 py-[2px] text-[10px] font-bold text-amber-900 leading-[1.2]">
                          NEW
                        </span>
                      )}
                      <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white leading-[1.3]">
                        {l.deal}
                      </span>
                      {(l.building_name || l.business_type || l.type) && (
                        <span className="min-w-0 truncate text-[11px] font-medium text-neutral-700">
                          {l.building_name || l.business_type || l.type}
                        </span>
                      )}
                    </div>

                    {/* Row 2: 가격 */}
                    <div className="text-[17px] font-bold leading-tight text-neutral-900">
                      {formatDealLabel(l)}
                    </div>

                    {/* Row 3: 메타 (truncate) */}
                    {metaParts.length > 0 && (
                      <div className="truncate text-[11.5px] text-neutral-600">
                        {metaParts.join(' · ')}
                      </div>
                    )}

                    {/* Row 4: 제목 (ai_title 없으면 skip) */}
                    {l.ai_title && (
                      <div className="truncate text-[12.5px] font-semibold leading-snug text-neutral-800">
                        {l.ai_title}
                      </div>
                    )}

                    {/* Row 5: 연식 + 타입 chip (NEW 는 상단으로 이동해 여기선 제외) */}
                    {(age || typeChip) && (
                      <div className="flex flex-nowrap gap-1 overflow-hidden">
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

                    {/* Row 6: 확인매물 날짜 (하단 고정) */}
                    <div className="mt-auto pt-0.5 text-[10px] font-medium text-rose-600">
                      {checkDate ? `확인매물 ${checkDate}` : ''}
                    </div>
                  </div>

                  {/* 우측 썸네일 — align-self: stretch 로 컨텐츠 높이 자동 매칭 */}
                  <div className="relative w-[108px] shrink-0 self-stretch overflow-hidden rounded-md bg-neutral-100">
                    {l.thumbnail_url ? (
                      <Image
                        src={l.thumbnail_url}
                        alt={l.ai_title ?? (l.dong ?? '매물')}
                        fill
                        sizes="108px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-300">
                        <ImageIcon className="size-6" aria-hidden />
                      </div>
                    )}
                    {l.has_video && (
                      <div className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        <Video className="size-2.5" /> 영상
                      </div>
                    )}
                    {/* L-card5 (2026-04-23 p.m.): 사진 개수 배지 제거 — 리스트에선 불필요 */}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
