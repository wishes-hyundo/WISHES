// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListPanel — 좌측 매물 리스트 (정렬 적용)
//
// L-ux2 (2026-04-22): 실사용 스크린샷(좁은 컬럼 + 크롤러 면적 0) 기반 개선
//   1) 면적 0 / 층 null 때 "- · 4" 가 찍히던 noise 제거
//   2) 좁은 카드에서 거래배지("월세")가 overflow 로 숨던 현상 → shrink-0 + flex-wrap
//   3) 가격 라인 truncate 로 한 줄 보장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo } from 'react';
import { MapPin, Image as ImageIcon } from 'lucide-react';
import { useMap2026Store, type MapListing, type SortKey } from '../store';
import { formatDealLabel, formatDeviation, formatArea, formatStationDistance } from '../lib/priceFormat';
import { SortMenu } from './SortMenu';

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
  const selectListing = useMap2026Store((s) => s.selectListing);

  const sorted = useMemo(() => sortListings(listings, sort), [listings, sort]);

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

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-neutral-400">
            <MapPin className="size-8 opacity-50" />
            <div className="text-[13px]">이 영역에 매물이 없습니다</div>
            <div className="text-[11.5px]">지도를 움직이거나 필터를 조정해 보세요</div>
          </div>
        )}
        {sorted.map((l) => {
          const dev = formatDeviation(l.median_deviation);
          const station = formatStationDistance(l.station_distance);
          const active = selectedId === l.id;
          // L-ux2: 크롤러 수집분에 area_m2 = 0 / floor_current = null 이 많아
          //   meta row 가 "- · 4 · 도보 7분" 처럼 앞부분이 무의미한 빈칸을 차지했음.
          //   이제 값이 있는 파트만 배열에 담고 "·" 구분자를 JSX 로 삽입한다.
          const hasArea = l.area_m2 != null && l.area_m2 > 0;
          const floorStr = l.floor_current == null ? '' : String(l.floor_current).trim();
          const hasFloor = floorStr !== '' && floorStr !== '-';
          const metaParts: Array<{ text: string; tone?: 'station' }> = [];
          if (hasArea) metaParts.push({ text: formatArea(l.area_m2) });
          if (hasFloor) metaParts.push({ text: floorStr });
          if (station) metaParts.push({ text: station, tone: 'station' });

          return (
            <button
              key={l.id}
              onClick={() => selectListing(l.id, true)}
              className={[
                'block w-full border-b border-neutral-50 px-4 py-3 text-left transition',
                active ? 'bg-emerald-50' : 'hover:bg-neutral-50',
              ].join(' ')}
            >
              {/* 배지 — shrink-0 + flex-wrap 으로 좁은 컬럼에서도 거래/타입 배지가
                  잘리지 않고 다음 줄로 내려가게 한다. */}
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
                {l.photo_count > 0 && (
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-neutral-400">
                    <ImageIcon className="size-3" />
                    {l.photo_count}
                  </span>
                )}
              </div>

              <div className="truncate text-[15px] font-bold leading-tight text-neutral-900">
                {formatDealLabel(l)}
              </div>

              <div className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
                {l.title ?? l.building_name ?? l.dong ?? '주소 미상'}
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
            </button>
          );
        })}
      </div>
    </aside>
  );
}
