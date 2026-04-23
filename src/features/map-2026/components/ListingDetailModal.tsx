// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListingDetailModal — /map 매물 상세 슬라이드 패널 (v3)
//
// 파일명은 Modal 로 유지하되 내부 구현은 ListPanel 바로 우측에 anchored
// 되는 슬라이드 패널 (absolute left-0) — MapClient 가 지도 영역 div 안에
// 마운트한다.
//
// L-card3 (2026-04-23 p.m.): v3 목업 확정본
//   · 상단 hero: 썸네일 200px + X 닫기 + 사진수/영상 배지
//   · 헤더: [월세][매물번호 N][업종] + 가격 + 주소 + ai_title
//   · 기본정보 섹션: 매물형태/공급전용/해당층/방수/관리비/입주가능
//   · 타입별 추가 섹션: 주거/상가/토지 조건부 렌더
//   · 옵션 chip 나열
//   · 하단: 닫기 / 전체보기
//
// 중개보수·360뷰·사진 갤러리는 제외 (사용자 요청).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { X, ExternalLink, ImageOff, MapPin, Video, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMap2026Store, type MapListing } from '../store';
import {
  formatDealLabel,
  formatArea,
} from '../lib/priceFormat';
import { buildListingBadges } from '../lib/buildAgeBadge';

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

function isResidential(type: string | null): boolean {
  if (!type) return false;
  return /원룸|투룸|쓰리룸|아파트|오피스텔|빌라|주택|단독|다가구|다세대|연립|고시원|쉐어하우스/.test(type);
}
function isCommercial(type: string | null): boolean {
  if (!type) return false;
  return /상가|사무|오피스|지식산업|공유오피스|근생|복합/.test(type);
}
function isLand(type: string | null): boolean {
  if (!type) return false;
  return /토지|대지|전|답|임야|잡종지/.test(type);
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === true) return '가능';
  if (v === false) return '불가능';
  return '-';
}

const AGE_TONE_CLASS: Record<string, string> = {
  newest:  'bg-emerald-50 text-emerald-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber:   'bg-amber-50 text-amber-700',
  gray:    'bg-neutral-100 text-neutral-600',
};

type RowProps = { label: string; value: React.ReactNode | null | undefined };
function Row({ label, value }: RowProps) {
  if (value == null || value === '' || value === '-') return null;
  return (
    <>
      <div className="text-neutral-500">{label}</div>
      <div className="text-neutral-800">{value}</div>
    </>
  );
}

export function ListingDetailModal() {
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  const closeListingDetail = useMap2026Store((s) => s.closeListingDetail);
  // L-detailcache1 (2026-04-23 p.m.): 뷰포트 재조회로 listings 가 갱신되어도
  //   선택된 매물 객체를 안정적으로 참조. listings.find() 가 null 을 반환해
  //   패널이 사라지던 모바일 버그 해결.
  const cachedListing = useMap2026Store((s) => s.detailListing);
  const listings = useMap2026Store((s) => s.listings);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 우선순위: cache (클릭 시점 snapshot) > listings 최신 데이터
  const listing: MapListing | null = detailListingId == null
    ? null
    : cachedListing ?? listings.find((l) => l.id === detailListingId) ?? null;

  const isOpen = !!listing;

  // L-gallery1 (2026-04-23 p.m.): 사진 갤러리 — 슬라이드 패널 내 좌/우 넘기기
  //   매물 상세 열릴 때 /api/listings/[id]/images 호출 (이미 L-imgpolicy2 로
  //   크롤링 차단 + self-hosted 만 통과). 자체 업로드 이미지 여러 장 넘겨봄.
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  // L-lightbox1 (2026-04-23 p.m.): 사진 크게 보기 (풀스크린 라이트박스)
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // L-tsfix-order1 (2026-04-23 p.m.): useState 를 ESC useEffect 앞으로 옮김.
  //   이전엔 useEffect 가 lightboxOpen 을 참조하지만 useState 가 뒤에 선언돼
  //   TS "used before declaration" 빌드 실패.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxOpen) {
        setLightboxOpen(false);
        return;
      }
      closeListingDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeListingDetail, lightboxOpen]);

  useEffect(() => {
    if (isOpen) closeBtnRef.current?.focus();
  }, [isOpen]);
  const listingId = listing?.id;
  useEffect(() => {
    if (listingId == null) {
      setGalleryImages([]);
      setGalleryIndex(0);
      return;
    }
    setGalleryIndex(0);
    let cancelled = false;
    fetch(`/api/listings/${listingId}/images`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (cancelled || !json?.data) return;
        const urls = (json.data as { url: string }[])
          .map((i) => i.url)
          .filter(Boolean);
        setGalleryImages(urls);
      })
      .catch(() => { /* 폴백 — thumbnail_url 만 사용 */ });
    return () => { cancelled = true; };
  }, [listingId]);

  // 좌/우 키보드 네비게이션
  useEffect(() => {
    if (!isOpen || galleryImages.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
      else if (e.key === 'ArrowRight') setGalleryIndex((i) => (i + 1) % galleryImages.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, galleryImages.length]);

  if (!listing) return null;

  const { isNew, age } = buildListingBadges({
    built_year: listing.built_year,
    created_at: listing.created_at,
  });
  const floorLabel = formatFloorPair(listing.floor_current, listing.floor_total);
  const areaStr = listing.area_m2 && listing.area_m2 > 0 ? formatArea(listing.area_m2) : null;
  const addressLine = listing.title ?? listing.building_name ?? listing.dong ?? '주소 미상';

  const maintenanceLabel = listing.maintenance_fee != null
    ? `${listing.maintenance_fee.toLocaleString()}만원`
    : null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="매물 상세"
      className="absolute left-0 top-0 z-30 flex h-full w-[380px] max-w-[85%] translate-x-0 flex-col overflow-hidden border-r border-neutral-200 bg-white shadow-2xl transition-transform duration-300"
    >
      {/* L-gallery1: Hero 갤러리 (넘김 가능) */}
      <div className="relative h-[220px] w-full shrink-0 overflow-hidden bg-neutral-200">
        {(() => {
          const src = galleryImages[galleryIndex] ?? listing.thumbnail_url;
          if (src) {
            return (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label="사진 크게 보기"
                className="absolute inset-0 block cursor-zoom-in"
              >
                <Image
                  key={src}
                  src={src}
                  alt={addressLine}
                  fill
                  sizes="380px"
                  className="object-cover"
                  unoptimized
                />
              </button>
            );
          }
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
              <ImageOff className="size-8" aria-hidden />
              <span className="text-[11.5px]">사진 없음</span>
            </div>
          );
        })()}

        {/* 좌/우 화살표 (이미지 2장 이상일 때만) */}
        {galleryImages.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
              }}
              aria-label="이전 사진"
              className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/75"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGalleryIndex((i) => (i + 1) % galleryImages.length);
              }}
              aria-label="다음 사진"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/75"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}

        {/* 하단 그라데이션 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />

        {/* 닫기 버튼 */}
        <button
          ref={closeBtnRef}
          onClick={closeListingDetail}
          aria-label="닫기"
          className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
        >
          <X className="size-4" />
        </button>

        {/* 하단 배지 그룹 — 영상 + 사진 카운터 */}
        <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
          {listing.has_video && (
            <span className="flex items-center gap-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
              <Video className="size-3" /> 영상
            </span>
          )}
          {galleryImages.length > 0 ? (
            <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
              {galleryIndex + 1} / {galleryImages.length}
            </span>
          ) : listing.photo_count > 0 ? (
            <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold text-white">
              {listing.photo_count}장
            </span>
          ) : null}
        </div>

        {/* 하단 도트 인디케이터 (≤8장) */}
        {galleryImages.length > 1 && galleryImages.length <= 8 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
            {galleryImages.map((_, i) => (
              <span
                key={i}
                className={[
                  'size-1.5 rounded-full transition',
                  i === galleryIndex ? 'bg-white' : 'bg-white/40',
                ].join(' ')}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 헤더: 배지 + 가격 + 주소 + ai_title */}
        <div className="border-b border-neutral-100 px-4 pb-3 pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {/* L-newbadge1 (2026-04-23 p.m.): NEW 를 좌측 최선두 + 노란색(부담 X) */}
            {isNew && (
              <span className="rounded bg-amber-400 px-1.5 py-[2px] text-[10px] font-bold text-amber-900 leading-[1.2]">
                NEW
              </span>
            )}
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-bold text-white leading-[1.3]">
              {listing.deal}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 leading-[1.3]">
              매물번호 {listing.id}
            </span>
            {listing.business_type && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 leading-[1.3]">
                {listing.business_type}
              </span>
            )}
            {age && (
              <span className={[
                'rounded px-1.5 py-[2px] text-[10px] font-bold leading-[1.2]',
                AGE_TONE_CLASS[age.tone] ?? AGE_TONE_CLASS.gray,
              ].join(' ')}>
                {age.text}
              </span>
            )}
          </div>

          <div className="mb-1.5 text-[22px] font-extrabold leading-tight text-neutral-900">
            {formatDealLabel(listing)}
          </div>

          <div className="mb-2 flex items-center gap-1 text-[12px] text-neutral-500">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{addressLine}</span>
          </div>

          {listing.ai_title && (
            <div className="text-[13px] font-semibold leading-snug text-neutral-800">
              {listing.ai_title}
            </div>
          )}
        </div>

        {/* 기본정보 */}
        <div className="border-b border-neutral-100 px-4 py-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            기본정보
          </div>
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
            <Row label="매물형태" value={listing.type} />
            <Row label="면적" value={areaStr} />
            <Row label="해당층" value={floorLabel} />
            {listing.rooms != null && listing.rooms > 0 && (
              <Row label="방/욕실" value={`${listing.rooms}개${listing.bathrooms ? ` / ${listing.bathrooms}개` : ''}`} />
            )}
            <Row label="관리비" value={maintenanceLabel} />
          </dl>
        </div>

        {/* 타입별 추가 섹션 */}
        {isResidential(listing.type) && (
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              주거 추가
            </div>
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
              {listing.built_year && (
                <Row label="사용승인" value={`${listing.built_year}${age ? ` · ${age.text}` : ''}`} />
              )}
              <Row label="방향" value={listing.direction} />
              <Row label="주차" value={listing.parking} />
              {listing.pet != null && <Row label="반려동물" value={boolLabel(listing.pet)} />}
              {listing.elevator != null && <Row label="엘리베이터" value={boolLabel(listing.elevator)} />}
            </dl>
          </div>
        )}

        {isCommercial(listing.type) && (
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              상가·사무실 추가
            </div>
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
              {listing.built_year && (
                <Row label="사용승인" value={`${listing.built_year}${age ? ` · ${age.text}` : ''}`} />
              )}
              <Row label="주차" value={listing.parking} />
              {listing.elevator != null && <Row label="엘리베이터" value={boolLabel(listing.elevator)} />}
              <Row label="업종" value={listing.business_type} />
            </dl>
          </div>
        )}

        {isLand(listing.type) && (
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              토지 추가
            </div>
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
              <Row label="지목" value={listing.type} />
              {listing.direction && <Row label="방향" value={listing.direction} />}
            </dl>
          </div>
        )}

        {/* 옵션 (features) */}
        {listing.features.length > 0 && (
          <div className="px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              옵션
            </div>
            <div className="flex flex-wrap gap-1">
              {listing.features.slice(0, 16).map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  {f}
                </span>
              ))}
              {listing.features.length > 16 && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                  +{listing.features.length - 16}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* L-lightbox2 (2026-04-23 p.m.): 풀스크린 사진 뷰어를 Portal 로 document.body 루트에 렌더.
          슬라이드 패널 <aside translate-x-0> 가 fixed 를 가두는 containing block 을 만들어
          이전엔 라이트박스가 380px 패널 영역에 갇혔음. createPortal 로 루트 렌더 → 진짜 풀스크린. */}
      {typeof document !== 'undefined' && lightboxOpen && galleryImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
            aria-label="닫기"
            className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
          >
            <X className="size-5" />
          </button>

          {galleryImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
                }}
                aria-label="이전 사진"
                className="absolute left-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGalleryIndex((i) => (i + 1) % galleryImages.length);
                }}
                aria-label="다음 사진"
                className="absolute right-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}

          {/* 현재 사진 (contain 으로 비율 유지, 클릭 전파 방지) */}
          <img
            src={galleryImages[galleryIndex]}
            alt={addressLine}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[95vh] max-w-[95vw] object-contain select-none"
          />

          {/* 하단 카운터 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold text-white tabular-nums">
            {galleryIndex + 1} / {galleryImages.length}
          </div>
        </div>,
        document.body
      )}

      {/* 푸터 */}
      <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
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
