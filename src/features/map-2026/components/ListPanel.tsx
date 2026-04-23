// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListPanel — 좌측 매물 리스트 (정렬 적용)
//
// L-ux2 (2026-04-22): 실사용 스크린샷(좁은 컴럼 + 크롤러 면적 0) 기반 개선
//   1) 면적 0 / 층 null 때 "- · 4" 가 찍히던 noise 제거
//   2) 좁은 카드에서 거래배지("월세")가 overflow 로 숨던 현상 → shrink-0 + flex-wrap
//   3) 가격 라인 truncate 로 한 줄 보장
//
// L-ux3 (2026-04-22): 가상화 도입 — limit=800 때 초기 paint 및 스크롤 지연 해소
//   기존 listings.map() 여러 800 개 <button> 정식 렌더 → 초기 랜더 ~3s, 스크롤 FPS ↓
//   @tanstack/react-virtual 로 뷰포트 내 ~12개만 렌더 → 초기 paint <100ms, 60fps 스크롤
//   동적 높이: measureElement 로 카드 배지 줄바꿈 자동 보정
//
// L-sidebar1 (2026-04-23 p.m.): 카드 표기 중복·단위 누락 수정
//   기존: title="강남구 논현동 세븐스텝 3층" + meta "3" (층 중복 + 단위 누락)
//   수정:
//     - title 에서 trailing 층 suffix (예: " 3층", " B1") 를 stripFloor 로 제거
//     - floor_current 가 숫자만이면 "3층" 으로 단위 보정, 이미 있으면 그대로
//     - address line: stripFloor(title) ?? building_name ?? dong 순
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Image from 'next/image';
import { MapPin, Image as ImageIcon } from 'lucide-react';
import { useMap2026Store, type MapListing, type SortKey } from '../store';
import { formatDealLabel, formatDeviation, formatArea, formatStationDistance } from '../lib/priceFormat';
import { SortMenu } from './SortMenu';

// ─────────────────────────────────────────────────────────────
// L-sidebar1: 한국 부동산 title 관례 "구 동 건물명 N층" 에서 trailing
// floor 부분만 제거한다. meta 영역에서 별도 floor 배지를 찍으므로
// title 내 floor 는 중복이 된다.
//   "강남구 논현동 세븐스텝 3층"  → "강남구 논현동 세븐스텝"
//   "강남구 논현동 세븐스텝 B1"   → "강남구 논현동 세븐스텝"
//   "강남구 논현동 세븐스텝 지하1층" → "강남구 논현동 세븐스텝"
//   "세븐스텝"                     → "세븐스텝"  (층 없음, 그대로)
// ─────────────────────────────────────────────────────────────
function stripTrailingFloor(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = String(s)
    .trim()
    .replace(/\s+(?:지하\s*\d+\s*층?|지하층?|B\s*\d+\s*층?|옥상층?|\d+\s*층|\d+\s*F)\s*$/i, '')
    .trim();
  return cleaned || null;
}

// floor_current 단위 보정:
//   "3"      → "3층"
//   "3층"    → "3층"        (이미 단위 있음)
//   "B1"     → "지하 1층"
//   "지하1층" → "지하1층"
//   "-"      → null (표시 안 함)
function formatFloor(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  if (/^\d+$/.test(s)) return `${s}층`;
  const mB = /^B\s*(\d+)\s*층?$/i.exec(s);
  if (mB) return `지하 ${mB[1]}층`;
  const mJ = /^지하\s*(\d+)\s*층?$/.exec(s);
  if (mJ) return `지하 ${mJ[1]}층`;
  return s;
}

function sortListings(list: MapListing[], sort: SortKey): MapListing[] {
  const copy = [...list];
  switch (sort) {
    case 'recent':
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
    case 'price_asc':
      copy.sort(
        (a, b) =>
          (a.price ?? a.deposit ?? a.monthly ?? Number.MAX_SAFE_INTEGER) -
          (b.price ?? b.deposit ?? b.monthly ?? Number.MAX_SAFE_INTEGER)
      );
      break;
    case 'price_desc':
      copy.sort(
        (a, b) =>
          (b.price ?? b.deposit ?? b.monthly ?? -1) -
          (a.price ?? a.deposit ?? a.monthly ?? -1)
      );
      break;
    case 'area_desc':
      copy.sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
      break;
    case 'deal_score':
      copy.sort((a, b) => (b.hero_score ?? 0) - (a.hero_score ?? 0));
      break;
  }
  return copy;
}

export function ListPanel() {
  const listings = useMap2026Store((s) => s.listings);
  const loading = useMap2026Store((s) => s.loading);
  const sort = useMap2026Store((s) => s.sort);
  const selectedId = useMap2026Store((s) => s.selectedId);
  // L-mapmodal1 (2026-04-23): 카드 클릭 시 상세 요약 모달이 열리도록 교체.
  //   이전 selectListing(id, true) 는 지도 flyTo + selectedId 업데이트만 수행해
  //   매물 정보가 보이지 않았다. openListingDetail 은 내부에서 selectListing 을
  //   재호출하므로 지도 포커스 동작은 그대로 유지된다.
  // L-slidepanel1 (2026-04-23 p.m.): 동일 store action 유지. 렌더러 쪽
  //   (ListingDetailModal → 슬라이드 패널) 에서 UI 표현만 변경.
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);

  const sorted = useMemo(() => sortListings(listings, sort), [listings, sort]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 108,
    overscan: 6,
    measureElement: typeof ResizeObserver !== 'undefined'
      ? (el) => el.getBoundingClientRect().height
      : undefined,
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
              const dev = formatDeviation(l.median_deviation);
              const station = formatStationDistance(l.station_distance);
              const active = selectedId === l.id;
              const hasArea = l.area_m2 != null && l.area_m2 > 0;
              const floorLabel = formatFloor(l.floor_current);
              const hasFloor = floorLabel != null;

              // L-sidebar1: 주소/단지명 line — title 우선이되 trailing 층 제거.
              //   title 이 없거나 층만 있었다면 building_name, 그 다음 dong.
              const stripped = stripTrailingFloor(l.title);
              const addressLine = stripped ?? l.building_name ?? l.dong ?? '주소 미상';

              const metaParts: Array<{ text: string; tone?: 'station' }> = [];
              if (hasArea) metaParts.push({ text: formatArea(l.area_m2) });
              if (hasFloor) metaParts.push({ text: floorLabel! });
              if (station) metaParts.push({ text: station, tone: 'station' });

              return (
                <button
                  key={l.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={vRow.index}
                  onClick={() => openListingDetail(l.id)}
                  className={[
                    'flex w-full items-start gap-3 border-b border-neutral-50 px-4 py-3 text-left transition',
                    active ? 'bg-emerald-50' : 'hover:bg-neutral-50',
                  ].join(' ')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white">
                      {l.deal}
                    </span>
                    {l.type && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700">
                        {l.type}
                      </span>
                    )}
                    {dev.kind !== 'neutral' && (
                      <span
                        className={[
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                          dev.kind === 'good'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700',
                        ].join(' ')}
                      >
                        {dev.text}
                      </span>
                    )}
                  </div>

                  <div className="truncate text-[15px] font-bold leading-tight text-neutral-900">
                    {formatDealLabel(l)}
                  </div>

                  <div className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
                    {addressLine}
                  </div>

                  {metaParts.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11.5px] text-neutral-600">
                      {metaParts.map((part, i) => (
                        <span
                          key={i}
                          className={[
                            'inline-flex items-center whitespace-nowrap',
                            part.tone === 'station' ? 'text-emerald-700' : '',
                          ].join(' ')}
                        >
                          {i > 0 && <span className="mr-1 text-neutral-300">·</span>}
                          {part.text}
                        </span>
                      ))}
                    </div>
                  )}
                  </div>

                  {/* L-thumb2 (2026-04-23 p.m.): 네이버 스타일 — 썸네일은 카드 우측에 */}
                  <div className="relative size-[84px] shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {l.thumbnail_url ? (
                      <Image
                        src={l.thumbnail_url}
                        alt={addressLine}
                        fill
                        sizes="84px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-300">
                        <ImageIcon className="size-6" aria-hidden />
                      </div>
                    )}
                    {l.photo_count > 1 && (
                      <div className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        +{l.photo_count - 1}
                      </div>
                    )}
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
