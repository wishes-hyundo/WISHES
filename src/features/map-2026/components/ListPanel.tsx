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

import { useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Image from 'next/image';
import { MapPin, Video, X } from "lucide-react";
import { useMap2026Store, type MapListing, type SortKey } from '../store';
import { formatDealLabel, formatArea } from '../lib/priceFormat';
import { buildListingBadges } from '../lib/buildAgeBadge';
import { listingCategory, listingCategoryOf } from '../lib/markerTier';
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
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);
  // L-clusterexact1 + L-clusterexact3 (2026-04-24 pm): 클러스터 클릭 시 정확한 N개만.
  const clusterFilterIds = useMap2026Store((s) => s.clusterFilterIds);
  const clusterFilterListings = useMap2026Store((s) => s.clusterFilterListings);
  const clusterFilterLabel = useMap2026Store((s) => s.clusterFilterLabel);
  const setClusterFilter = useMap2026Store((s) => s.setClusterFilter);
  // L-naver-2026truecount2 (2026-04-27): categoryCounts 미사용 (client sorted.length 단일화).
  const filterCategory = useMap2026Store((s) => s.filter.category);
  // L-naver-2026clientvalidation1 (2026-04-27): BoB 이중 방어선 — 전체 filter 가져옴.
  //   사용자 발견 버그: 서버 query 가 데이터 무결성 문제로 잘못된 매물 통과시킴.
  //   (rooms=2 인데 type='원룸', deposit 필터인데 매매 매물 등)
  //   BoB 표준: 서버 1차 필터 + 클라이언트 2차 검증 = 이중 방어선.
  //   사용자가 보는 모든 매물은 100% 필터 조건 충족 보장.
  const fullFilter = useMap2026Store((s) => s.filter);
  // L-nolimit1 (2026-04-26): bbox > 0.3° 면 listings fetch 안 됨 (광역 뷰).
  //   광역 뷰에선 빈 listings 라 안내 메시지 다르게.
  const bbox = useMap2026Store((s) => s.bbox);
  const isWideView = bbox && (
    (bbox.east - bbox.west > 0.3) || (bbox.north - bbox.south > 0.3)
  );

  // 정렬 + 필터:
  //   clusterFilterListings 있으면 (by-ids fetch 완료) 그걸 base 로 사용 → 100% 정확
  //   없으면 기존 listings 에서 clusterFilterIds 교집합 (hydrate 대기 중 임시)
  // L-naver-2026catfilter1 (2026-04-27): 카테고리 클라이언트 필터 추가.
  //   사용자 피드백 "지도상 매물 개수와 좌측 카운트 안 맞음" — 서버 categoryCounts (별도
  //   query) 와 listings 메인 query 가 조건 불일치 (hasImages/features/rooms 등이
  //   counts 에 미적용). 또한 "주거 누르면 주거만" 보장 안 됨.
  //   해결: 클라이언트에서 listingCategory(type) 기준 강제 필터 → 마커/사이드바 일관.
  const sorted = useMemo(() => {
    const baseList = clusterFilterListings && clusterFilterListings.length > 0
      ? clusterFilterListings
      : listings;
    // L-mapfix-2026-05-02 (사장님 명령): cluster filter active 시
    //   카테고리 filter skip. 사용자가 클러스터 클릭 = 그 영역 전체 매물 보고 싶다
    //   는 의도. category 가 추가로 줄이면 사이드바 카운트와 cluster 표기 mismatch.
    const isClusterFilterActive = !!(clusterFilterListings && clusterFilterListings.length > 0)
      || !!(clusterFilterIds && clusterFilterIds.length > 0);
    // 카테고리 필터 적용 (investment 는 cross-cutting → 미적용 / cluster filter 시도 미적용)
    const catFiltered = (filterCategory === 'investment' || isClusterFilterActive)
      ? baseList
      // G-122 (2026-05-04): listingCategoryOf 로 cross-residential (사무실/근린/학원 < 50㎡) 도 residence 분류 — 서버 정렬.
      : baseList.filter((l) => listingCategoryOf(l) === filterCategory);

    // L-naver-2026clientvalidation1 (2026-04-27): BoB 이중 방어선 — 매 매물 100% 검증.
    //   서버 query 의 데이터 무결성 누락을 클라이언트가 강제 차단.
    //   다음 모든 조건이 정확히 매칭되는 매물만 통과.
    const validated = catFiltered.filter((l) => {
      // 1. rooms 필터 (type 기반 정확 매칭)
      if (fullFilter.rooms.length > 0) {
        const t = (l.type ?? '').trim();
        const wantOne = fullFilter.rooms.includes(1);
        const wantTwo = fullFilter.rooms.includes(2);
        const wantThreePlus = fullFilter.rooms.some((n) => n >= 3);
        const isOneRoom = t === '원룸';
        const isTwoRoom = t === '투룸';
        const isThreeRoomPlus = t.includes('쓰리룸') || t.includes('포룸')
          || (l.rooms != null && Number(l.rooms) >= 3);
        const matches = (wantOne && isOneRoom)
          || (wantTwo && isTwoRoom)
          || (wantThreePlus && isThreeRoomPlus);
        if (!matches) return false;
      }
      // 2. 거래 유형 (deals)
      if (fullFilter.deals.length > 0 && !fullFilter.deals.includes(l.deal)) {
        return false;
      }
      // 3. 매매가 (price): 매매 매물만 의미 — 다른 거래는 자동 통과
      if (fullFilter.minPrice != null) {
        if (l.deal === '매매' && (l.price == null || l.price < fullFilter.minPrice)) return false;
      }
      if (fullFilter.maxPrice != null) {
        if (l.deal === '매매' && (l.price == null || l.price > fullFilter.maxPrice)) return false;
      }
      // 4. 보증금 (deposit): 전세/월세/단기 의미 — 매매는 자동 제외
      if (fullFilter.minDeposit != null) {
        if (l.deal === '매매') return false;  // 매매는 보증금 개념 없음 → 제외
        if (l.deposit == null || l.deposit < fullFilter.minDeposit) return false;
      }
      if (fullFilter.maxDeposit != null) {
        if (l.deal === '매매') return false;
        if (l.deposit == null || l.deposit > fullFilter.maxDeposit) return false;
      }
      // 5. 월세 (monthly): 월세/단기 의미 — 매매/전세 제외
      if (fullFilter.minMonthly != null) {
        if (l.deal === '매매' || l.deal === '전세') return false;
        if (l.monthly == null || l.monthly < fullFilter.minMonthly) return false;
      }
      if (fullFilter.maxMonthly != null) {
        if (l.deal === '매매' || l.deal === '전세') return false;
        if (l.monthly == null || l.monthly > fullFilter.maxMonthly) return false;
      }
      // 6. 면적 (m²)
      if (fullFilter.minArea != null && (l.area_m2 == null || l.area_m2 < fullFilter.minArea)) return false;
      if (fullFilter.maxArea != null && (l.area_m2 == null || l.area_m2 > fullFilter.maxArea)) return false;
      // 7. 역세권 (nearStation seconds → meters: 80m/min)
      if (fullFilter.nearStation != null) {
        const meters = Math.max(80, Math.round((fullFilter.nearStation / 60) * 80));
        if (l.station_distance == null || l.station_distance > meters) return false;
      }
      // 8. 신축 (N년 이내)
      if (fullFilter.newBuildYears != null) {
        const threshold = new Date().getFullYear() - fullFilter.newBuildYears;
        const yr = Number(l.built_year);
        if (!Number.isFinite(yr) || yr < threshold) return false;
      }
      // 9. property types (UI 의 빠른 선택과 별개로 detail 의 type 선택)
      if (fullFilter.propertyTypes.length > 0 && !fullFilter.propertyTypes.includes(l.type ?? '')) {
        return false;
      }
      // 10. features (반려동물/주차/엘리베이터 등 — AND 조건)
      if (fullFilter.features.length > 0) {
        const f = Array.isArray(l.features) ? l.features : [];
        if (!fullFilter.features.every((req) => f.includes(req))) return false;
      }
      // 11. 사진 있음
      if (fullFilter.hasImages && !l.thumbnail_url) return false;
      return true;
    });

    const base = sortListings(validated, sort);
    if (!clusterFilterIds || clusterFilterIds.length === 0) return base;
    const set = new Set(clusterFilterIds);
    return base.filter((l) => set.has(l.id));
  }, [listings, sort, clusterFilterIds, clusterFilterListings, filterCategory, fullFilter]);

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

  // L-listpanel-select1 (2026-04-24 pm): 매물 선택 시 해당 카드로 자동 스크롤.
  //   virtualizer 상 그 index 가 viewport 밖이면 사용자가 "어떤 매물인지" 못 찾음.
  //   detailListingId 나 selectedId 가 바뀌면 scrollToIndex 로 가시권에 가져온다.
  const focusId = detailListingId ?? selectedId;
  useEffect(() => {
    if (focusId == null) return;
    const idx = sorted.findIndex((l) => l.id === focusId);
    if (idx >= 0) {
      rowVirtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
    }
  }, [focusId, sorted, rowVirtualizer]);

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          {/* L-naver-2026truecount2 (2026-04-27): 카운트를 sorted.length 로 단일화.
              사용자 피드백 "지도상 매물 개수와 좌측 카운트 안 맞음".
              원인: 서버 categoryCounts query 가 메인 listings query 와 다른 조건
                    (hasImages/features/rooms/price 미적용) → 두 카운트 불일치.
              해결: client 측 sorted.length (= 마커가 사용하는 listings 와 동일 source) 로
                    단일화 → 마커, 사이드바, 탭 카운트 모두 일치 보장. */}
          {(() => {
            if (loading) {
              return (<>
                <span className="text-[14px] font-bold text-neutral-900">검색 중…</span>
                <span className="text-[11.5px] text-neutral-500">매물</span>
              </>);
            }
            if (isWideView) {
              return <span className="text-[12.5px] font-semibold text-neutral-500">지도 줌인 필요</span>;
            }
            const total = sorted.length;
            return (
              <>
                <span className="text-[14px] font-bold text-neutral-900">
                  {total.toLocaleString()}개
                </span>
                <span className="text-[11.5px] text-neutral-500">매물</span>
              </>
            );
          })()}
        </div>
        <SortMenu />
      </header>
      {clusterFilterIds && clusterFilterIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
          <span className="truncate">
            {/* L-complexlabel1 (2026-04-26): 단지명/지역명 라벨 우선 표시 */}
            {clusterFilterLabel ? (
              <>
                <span className="font-bold">{clusterFilterLabel}</span>
                <span className="ml-1 opacity-80">{clusterFilterIds.length}개 매물</span>
              </>
            ) : (
              <>선택한 {clusterFilterIds.length}개 매물만 보는 중</>
            )}
            {clusterFilterListings == null && <span className="ml-1 opacity-70">(로딩 중…)</span>}
          </span>
          <button
            onClick={() => setClusterFilter(null)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
          >
            <X className="size-3" /> 해제
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sorted.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-neutral-400">
            <MapPin className="size-8 opacity-50" />
            {isWideView ? (
              <>
                <div className="text-[13px]">동 단위로 줌인하여 매물을 확인하세요</div>
                <div className="text-[11.5px]">지도의 마커를 클릭하거나 휠로 확대해 보세요</div>
              </>
            ) : (
              <>
                <div className="text-[13px]">이 영역에 매물이 없습니다</div>
                <div className="text-[11.5px]">지도를 움직이거나 필터를 조정해 보세요</div>
              </>
            )}
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
              const active = focusId === l.id;
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

                  {/* G-93 (2026-05-04): 사진 없는 매물(크롤링 + 자체 업로드 0)은 thumb 영역 숨김.
                      이전엔 회색 placeholder 가 카드 우측에 빈 박스로 보여 22개 매물 모두 사진 없을 때 카드 줄줄이 회색 박스. */}
                  {l.thumbnail_url ? (
                    <div className="relative w-[108px] shrink-0 self-stretch overflow-hidden rounded-md bg-neutral-100">
                      <Image
                        src={l.thumbnail_url}
                        alt={l.ai_title ?? (l.dong ?? '매물')}
                        fill
                        sizes="108px"
                        className="object-cover"
                        unoptimized
                      />
                      {l.has_video && (
                        <div className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          <Video className="size-2.5" /> 영상
                        </div>
                      )}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
