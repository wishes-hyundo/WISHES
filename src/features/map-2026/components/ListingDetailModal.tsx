// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListingDetailModal — 파일명은 모달 그대로 유지하되 "우측 슬라이드 패널"
// 로 내부 구현을 교체 (L-slidepanel1, 2026-04-23 p.m.).
//
// 배경
//   L-mapmodal1 로 중앙 모달 + 백드롭 방식을 도입했으나, 사용자 피드백은
//   "원래 슬라이드 패널이었는데 뜬금없이 바꿔놓음" 이었다. 중앙 모달은 지도
//   상호작용(스크롤·클릭)을 차단해 "핀 하나 보려다 지도 탐색이 끊긴다" 는
//   체감 문제를 만들었다. 네이버·직방·다방이 모두 채택한 우측 슬라이드 패널
//   (anchored drawer) 형식으로 되돌린다.
//
// 설계 원칙
//   · 지도 영역 우측에 anchored (fixed right-0)
//   · 너비 380px, 높이 전체
//   · 백드롭 없음 — 지도 pan/zoom 계속 가능
//   · translate-x transition 으로 부드러운 진입/퇴장
//   · ESC + X 버튼 + 패널 바깥(지도) 클릭으로 닫기
//   · body 스크롤 잠금은 제거 — 패널 내부만 overflow-y-auto
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

// 제목에서 꼬리 층 suffix 제거 — ListPanel 과 동일 정책.
function stripTrailingFloor(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = String(s)
    .trim()
    .replace(/\s+(?:지하\s*\d+\s*층?|지하층|B\d+|옥상층?|\d+\s*층|\d+F)\s*$/i, '')
    .trim();
  return cleaned || null;
}

// floor_current 단위 보정.
function formatFloor(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  if (/^\d+$/.test(s)) return `${s}층`;
  const m = /^B(\d+)$/i.exec(s);
  if (m) return `지하 ${m[1]}층`;
  return s;
}

export function ListingDetailModal() {
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const closeListingDetail = useMap2026Store((s) => s.closeListingDetail);
  const listings = useMap2026Store((s) => s.listings);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 현재 오픈된 id 로 listings 에서 찾는다. 뷰포트 밖으로 나가거나 필터가
  // 바뀌어 listings 에서 빠지면 null 이 되어 패널이 닫힌다.
  const listing = detailListingId != null
    ? listings.find((l) => l.id === detailListingId) ?? null
    : null;

  const isOpen = !!listing;

  // ESC 로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeListingDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeListingDetail]);

  // 오픈 시 닫기 버튼에 포커스
  useEffect(() => {
    if (isOpen) closeBtnRef.current?.focus();
  }, [isOpen]);

  if (!listing) return null;

  const dev = formatDeviation(listing.median_deviation);
  const station = formatStationDistance(listing.station_distance);
  const hasArea = listing.area_m2 != null && listing.area_m2 > 0;
  const floorLabel = formatFloor(listing.floor_current);
  const hasFloor = floorLabel != null;
  const strippedTitle = stripTrailingFloor(listing.title);
  const addressLine = strippedTitle ?? listing.building_name ?? listing.dong ?? '주소 미상';

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="매물 상세 요약"
      // 우측 고정 + full height. 백드롭 없음 — 지도 조작 유지.
      // translate-x-0 (열림) / full (닫힘) 은 상단에서 isOpen 으로 early return
      // 되므로 렌더시에는 항상 열린 상태. 퇴장 애니메이션이 필요하면 CSS
      // conditional 로 교체 가능.
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[380px] translate-x-0 flex-col overflow-hidden border-l border-neutral-200 bg-white shadow-2xl transition-transform duration-300"
    >
      {/* 헤더 — 배지 + X */}
      <div className="flex items-start justify-between gap-2 border-b border-neutral-100 px-5 pt-4 pb-3">
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

      {/* 스크롤 본문 */}
      <div className="flex-1 overflow-y-auto">
        {/* 썸네일 */}
        <div className="relative h-52 w-full bg-neutral-100">
          {listing.thumbnail_url ? (
            <Image
              src={listing.thumbnail_url}
              alt={addressLine}
              fill
              sizes="380px"
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

        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <div className="text-[22px] font-extrabold leading-tight text-neutral-900">
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
                <dd className="font-medium text-neutral-800">{floorLabel}</dd>
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
    </aside>
  );
}
