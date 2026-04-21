// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MiniCard — hover 시 떠오르는 작은 카드
//
// 🎯 Phase F 업그레이드
//   - 서버 regional deviation (넓은 지역 median 대비) 와
//     클라이언트 local deviation (현재 뷰포트 median 대비) 을 듀얼 배지로 표시
//   - 둘이 일치하면 하나만, 다르면 둘 다 표시 (차이가 인사이트)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store } from '../store';
import { useLocalComparable } from '../hooks/useLocalComparable';
import { formatDealLabel, formatDeviation, formatArea, formatStationDistance } from '../lib/priceFormat';

// L-ux3 (2026-04-22): MiniCard 뷰포트 클램프
//   기존 left=pos.x+12 / top=pos.y+12 고정 오프셋이라
//   오른쪽/아래 엣지에서 카드가 맵 바깥으로 벗어나 잘려 보였음.
//   이제 카드 크기(CARD_W × CARD_H)와 창 너비/높이를 고려해
//   넘칠 것 같으면 커서 반대쪽(좌/위) 으로 뒤집는다.
const CARD_W = 256; // w-64
const CARD_H = 200; // 대략 - 내용에 따라 다르나 이 정도면 클램프 정확도 충분

function clampPos(x: number, y: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: x + 12, top: y + 12 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 기본 우하단 앵커; 넘치면 좌/상단으로 뒤집기
  const right = x + 12 + CARD_W > vw - 8;
  const bottom = y + 12 + CARD_H > vh - 8;
  const left = right ? Math.max(8, x - 12 - CARD_W) : x + 12;
  const top = bottom ? Math.max(8, y - 12 - CARD_H) : y + 12;
  return { left, top };
}

export function MiniCard() {
  const listing = useMap2026Store((s) => s.hoveredListing);
  const pos = useMap2026Store((s) => s.hoverPos);
  const localMap = useLocalComparable();

  if (!listing || !pos) return null;
  const dev = formatDeviation(listing.median_deviation);
  const station = formatStationDistance(listing.station_distance);
  const local = localMap.get(listing.id);
  const localDev = local?.localDeviation != null ? formatDeviation(local.localDeviation) : null;

  // 두 deviation 이 둘 다 의미있고, 방향이 달라야 진짜 표시 가치
  const showLocal = localDev && localDev.kind !== 'neutral' &&
    (dev.kind !== localDev.kind || Math.abs((listing.median_deviation ?? 0) - (local?.localDeviation ?? 0)) > 0.03);

  const clamped = clampPos(pos.x, pos.y);

  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl"
      style={{
        left: clamped.left,
        top: clamped.top,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white">
          {listing.deal}
        </span>
        <div className="flex items-center gap-1">
          {dev.kind !== 'neutral' && (
            <span
              title="지역 전체 median 대비"
              className={[
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                dev.kind === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
              ].join(' ')}
            >
              지역 {dev.text}
            </span>
          )}
          {showLocal && localDev && (
            <span
              title="현재 지도에 보이는 매물 median 대비"
              className={[
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                localDev.kind === 'good' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700',
              ].join(' ')}
            >
              현재뷰 {localDev.text}
            </span>
          )}
        </div>
      </div>
      <div className="text-[16px] font-bold leading-tight">
        {formatDealLabel(listing)}
      </div>
      <div className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
        {listing.title ?? listing.building_name ?? listing.dong ?? ''}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11.5px] text-neutral-600">
        <div>{formatArea(listing.area_m2)}</div>
        <div>{listing.floor_current ?? '-'}</div>
        {station && <div className="col-span-2 text-emerald-700">{station}</div>}
        {local && local.sampleSize >= 2 && (
          <div className="col-span-2 text-[10px] text-neutral-400">
            뷰포트 comparable {local.sampleSize}건
          </div>
        )}
      </div>
    </div>
  );
}
