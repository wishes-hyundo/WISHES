// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListingDetailModal — /map 에서 매물 핀·카드를 클릭했을 때 열리는
// 간단 상세 모달. 전체 상세 페이지(/listings/[id]) 의 요약 버전.
//
// L-mapmodal1 (2026-04-23): 사용자 피드백
//   "매물을 누르면 매물페이지 모달도 안나오고"
//
// 이전엔 selectListing(id, true) 만 호출되어 지도 포커스·리스트 하이라이트는
// 됐지만 매물 정보를 확인할 UI 가 없었다(MiniCard 는 호버 전용, pointer-events
// none). 실제 정보를 빠르게 보여주는 모달을 추가해 "핀 클릭 → 매물 정보 확인
// → 전체 상세 이동" 흐름을 완성한다.
//
// 설계 원칙
//   - 요약 뷰: MapListing 에 이미 있는 필드만으로 구성 — 추가 fetch 금지(지도
//     인터랙션 직후 latency spike 회피). 전체 사진·설명은 `[전체보기]` → 전체
//     상세 페이지로 넘긴다.
//   - 접근성: role="dialog" aria-modal="true", ESC 닫기, 백드롭 클릭 닫기,
//     body 스크롤 잠금, 첫 포커스 = 닫기 버튼.
//   - 시각: /search 모달 기조(top-center + fixed overlay) 대신 중앙 카드 풀
//     — 작은 요약 뷰이므로 공간 효율 우선.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X, ExternalLink, ImageOff, MapPin } from 'lucide-react';
import { useMap2026Store } from '../store';
import {
  formatDealLabel,
  formatDeviation,
  formatArea,
  formatStationDistance,
} from '../lib/priceFormat';

export function ListingDetailModal() {
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const closeListingDetail = useMap2026Store((s) => s.closeListingDetail);
  const listings = useMap2026Store((s) => s.listings);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 현재 오픈된 id 로 listings 에서 찾는다. 뷰포트 밖으로 나가거나 필터가
  // 바뀌어 listings 에서 빠지면 null 이 되어 자동 언마운트.
  const listing = detailListingId != null
    ? listings.find((l) => l.id === detailListingId) ?? null
    : null;

  // ESC 로 닫기
  useEffect(() => {
    if (!listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeListingDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listing, closeListingDetail]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!listing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [listing]);

  // 오픈 시 닫기 버튼에 포커스 (첫 Tab 이 모달 내부로 진입하도록)
  useEffect(() => {
    if (!listing) return;
    closeBtnRef.current?.focus();
  }, [listing]);

  if (!listing) return null;

  const dev = formatDeviation(listing.median_deviation);
  const station = formatStationDistance(listing.station_distance);
  const hasArea = listing.area_m2 != null && listing.area_m2 > 0;
  const floorStr = listing.floor_current == null ? '' : String(listing.floor_current).trim();
  const hasFloor = floorStr !== '' && floorStr !== '-';
  const addressLine = listing.title ?? listing.building_name ?? listing.dong ?? '주소 미상';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={closeListingDetail}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="매물 상세 요약"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* 헤더 — 닫기 + 배지 */}
        <div className="relative flex items-start justify-between gap-2 border-b border-neutral-100 px-5 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-bold text-white">
              {listing.deal}
            </span>
            {listing.type && (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                {listing.type}
              </span>
            )}
            {dev.kind !== 'neutral' && (
              <span
                className={[
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                  dev.kind === 'good'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700',
                ].join(' ')}
              >
                {dev.text}
              </span>
            )}
          </div>
          <button
            ref={closeBtnRef}
            onClick={closeListingDetail}
            aria-label="닫기"
            className="shrink-0 rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 썸네일 */}
        <div className="relative h-48 w-full bg-neutral-100">
          {listing.thumbnail_url ? (
            <Image
              src={listing.thumbnail_url}
              alt={addressLine}
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-300">
              <ImageOff className="size-8" aria-hidden />
              <span className="text-[11.5px]">사진 없음</span>
            </div>
          )}
          {listing.photo_count > 1 && (
            <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
              +{listing.photo_count - 1}장
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <div className="text-[20px] font-extrabold leading-tight text-neutral-900">
              {formatDealLabel(listing)}
            </div>
            <div className="mt-1 flex items-start gap-1 text-[13px] text-neutral-500">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{addressLine}</span>
            </div>
          </div>

          {/* 메타 표 */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            {hasArea && (
              <div className="flex items-baseline gap-2">
                <dt className="text-neutral-500">면적</dt>
                <dd className="font-medium text-neutral-800">{formatArea(listing.area_m2)}</dd>
              </div>
            )}
            {hasFloor && (
              <div className="flex items-baseline gap-2">
                <dt className="text-neutral-500">층</dt>
                <dd className="font-medium text-neutral-800">{floorStr}</dd>
              </div>
            )}
            {listing.rooms != null && listing.rooms > 0 && (
              <div className="flex items-baseline gap-2">
                <dt className="text-neutral-500">방</dt>
                <dd className="font-medium text-neutral-800">{listing.rooms}개</dd>
              </div>
            )}
            {listing.built_year && (
              <div className="flex items-baseline gap-2">
                <dt className="text-neutral-500">준공</dt>
                <dd className="font-medium text-neutral-800">{listing.built_year}</dd>
              </div>
            )}
            {station && (
              <div className="col-span-2 flex items-baseline gap-2">
                <dt className="text-neutral-500">역세권</dt>
                <dd className="font-medium text-emerald-700">{station}</dd>
              </div>
            )}
          </dl>

          {/* 특장점 칩 */}
          {listing.features.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {listing.features.slice(0, 8).map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  {f}
                </span>
              ))}
              {listing.features.length > 8 && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                  +{listing.features.length - 8}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 푸터 — 닫기 / 전체보기 */}
        <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            onClick={closeListingDetail}
            className="flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            닫기
          </button>
          <Link
            href={`/listings/${listing.id}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
          >
            <span>전체보기</span>
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
