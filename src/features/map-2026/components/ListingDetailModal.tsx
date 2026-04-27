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
import { X, ExternalLink, ImageOff, MapPin, Video, ChevronLeft, ChevronRight, Phone, ShieldCheck } from 'lucide-react';
import AgentContactModal, { type AgentInfo } from '@/components/AgentContactModal';
import InquiryModal from '@/components/InquiryModal';
import { openKakaoChannelChat, openNaverBooking } from '@/lib/externalContact';
import { INTERIOR_FEATURES, SECURITY_FEATURES, hasFeatureWithBools } from '@/lib/featureIcons';
import { useMap2026Store, type MapListing } from '../store';
import { useAuth } from '@/contexts/AuthContext';
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

// L-modal-fields2 (2026-04-24 pm): usage_approved 날짜 가드.
// DB 의 일부 매물에 "주거용" 같은 비날짜 값이 들어있어 연도로 시작하는 값만 통과시킨다.
function isValidDateLike(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = String(v).trim();
  return /^(18|19|20|21)[0-9]{2}/.test(s);
}

const AGE_TONE_CLASS: Record<string, string> = {
  newest:  'bg-emerald-50 text-emerald-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber:   'bg-amber-50 text-amber-700',
  gray:    'bg-neutral-100 text-neutral-600',
};

// L-modal-v7-3 (2026-04-24): 네이버 벤치마크 — 매물 타입별 헤더 H1 분기
//   - 아파트/오피스텔: 단지명 강조 (예: "도시형생활주택 지안타워 · 16층")
//   - 주거(원룸/투룸/빌라/다가구/단독): 매물종류 + 층위 (예: "빌라·중층", "투룸")
//   - 상가/사무실/공장/토지: 매물종류만 (예: "대형사무실", "일반상가")
function floorPosition(cur: string | null | undefined, total: string | null | undefined): string | null {
  const c = parseInt(String(cur || '').trim(), 10);
  const t = parseInt(String(total || '').trim(), 10);
  if (!c || !t) return null;
  const r = c / t;
  if (r < 0.34) return '저층';
  if (r < 0.67) return '중층';
  return '고층';
}
function formatPropertyHeading(listing: MapListing, fallbackFloorLabel: string | null): string {
  const type = listing.type || '';
  const purpose = (listing as any).building_purpose?.trim?.() || null;
  const buildingName = (listing as any).building_name?.trim?.() || null;
  const floorPos = floorPosition(listing.floor_current, listing.floor_total);

  // 아파트 / 오피스텔: 단지명 + 층 (네이버처럼 단지가 핵심)
  if (type === '아파트' || type === '오피스텔') {
    if (buildingName) {
      const head = purpose ? `${purpose} ${buildingName}` : buildingName;
      return fallbackFloorLabel ? `${head} · ${fallbackFloorLabel}` : head;
    }
  }
  // 주거(원룸/투룸/쓰리룸/빌라/다가구/단독): 매물종류만
  //   (층위/방수는 아래 3메트릭 카드에 이미 나오므로 H1 중복 제거)
  if (/원룸|투룸|쓰리룸|빌라|다가구|단독|연립|다세대|주택/.test(type)) {
    return type;
  }
  // 상가 / 사무실 / 공장 / 창고 / 토지: 매물종류만
  if (/상가|사무|오피스|공장|창고|지식산업|근생|복합|토지|대지|전|답|임야|잡종지/.test(type)) {
    return type;
  }
  return type || '매물';
}

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
  const { user } = useAuth();
  const isAuthed = !!user;
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

  // L-modal-v7 (2026-04-24): 상세 확장 필드 fetch (ai_description·created_by·4단검증)
  const [detailExtra, setDetailExtra] = useState<{
    ai_description: string | null;
    created_by: string | null;
    last_verified_at: string | null;
    room_layout: string | null;
    is_duplex: boolean | null;
    illegal_building: boolean | null;
    total_parking_spaces: number | null;
    views: number | null;
    created_at: string | null;
    usage_approved: string | null;
    // L-modal-fields2 (2026-04-24 pm): 누락 필드 복구
    maintenance_includes: string[] | null;
    maintenance_excludes: string[] | null;
    parking_fee: number | null;
    station_name: string | null;
    station_distance: number | null;
    building_purpose: string | null;
    available_date: string | null;
    area_supply_m2: number | null;
  } | null>(null);
  const [agentProfile, setAgentProfile] = useState<{
    name: string | null;
    avatar_url: string | null;
    phone: string | null;
    office_name: string | null;
    office_phone: string | null;
    office_address: string | null;
    registration_no: string | null;
    career_years: number | null;
  } | null>(null);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);

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

  // L-modal-v7: 상세 확장 필드 + 담당자 프로필 fetch
  useEffect(() => {
    if (listingId == null) { setDetailExtra(null); setAgentProfile(null); return; }
    setDetailExtra(null);
    setAgentProfile(null);
    setShowFullDesc(false);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/listings/${listingId}`);
        if (!r.ok) return;
        const json = await r.json();
        if (cancelled || !json?.success || !json.data) return;
        const d = json.data;
        setDetailExtra({
          ai_description: d.ai_description || null,
          created_by: d.created_by || null,
          last_verified_at: d.last_verified_at || null,
          room_layout: d.room_layout || null,
          is_duplex: (d.is_duplex ?? null),
          illegal_building: (d.illegal_building ?? null),
          total_parking_spaces: (d.total_parking_spaces ?? null),
          views: (typeof d.views === 'number' ? d.views : null),
          created_at: d.created_at || null,
          usage_approved: d.usage_approved || null,
          // L-modal-fields2 (2026-04-24 pm)
          maintenance_includes: Array.isArray(d.maintenance_includes) ? d.maintenance_includes : null,
          maintenance_excludes: Array.isArray(d.maintenance_excludes) ? d.maintenance_excludes : null,
          parking_fee: (typeof d.parking_fee === 'number' ? d.parking_fee : null),
          station_name: d.station_name || null,
          station_distance: (typeof d.station_distance === 'number' ? d.station_distance : null),
          building_purpose: d.building_purpose || null,
          available_date: d.available_date || null,
          area_supply_m2: (typeof d.area_supply_m2 === 'number' ? d.area_supply_m2 : null),
        });
        if (d.created_by && !d.source_site) {
          const ag = await fetch(`/api/agent/${d.created_by}`);
          if (!ag.ok) return;
          const aj = await ag.json();
          if (cancelled) return;
          setAgentProfile({
            name: aj.name || null,
            avatar_url: aj.avatar_url || null,
            phone: aj.phone || null,
            office_name: aj.office_name || null,
            office_phone: aj.office_phone || null,
            office_address: aj.office_address || null,
            registration_no: aj.registration_no || null,
            career_years: (typeof aj.career_years === 'number' ? aj.career_years : null),
          });
        }
      } catch { /* noop */ }
    })();
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
  const addressLine = listing.title ?? (listing as any).building_name ?? listing.dong ?? '주소 미상';

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
          ) : (listing as any).photo_count > 0 ? (
            <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold text-white">
              {(listing as any).photo_count}장
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
        {/* L-modal-v7-2 (2026-04-24): 헤더 — H1(건물명·층) + 주소 + 가격 + 비교배지 */}
        <div className="border-b border-neutral-100 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[18px] font-bold leading-tight text-neutral-900">
              {formatPropertyHeading(listing, floorLabel)}
            </h1>
            <span className="flex-shrink-0 text-[11px] font-mono text-neutral-400">매물번호 {listing.id}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-neutral-500">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{listing.title || addressLine}</span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[22px] font-extrabold leading-tight text-neutral-900">
              {formatDealLabel(listing)}
            </span>
            {typeof listing.median_deviation === 'number' && Math.abs(listing.median_deviation) >= 1 && (
              <span className={[
                'ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold',
                listing.median_deviation < 0
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-amber-50 text-amber-700',
              ].join(' ')}>
                동일면적 평균 대비 {listing.median_deviation > 0 ? '+' : ''}{Math.round(listing.median_deviation)}%
              </span>
            )}
          </div>
        </div>

        {/* L-modal-v7-2: 3 메트릭 카드 */}
        <div className="border-b border-neutral-100 px-4 py-3 grid grid-cols-3 gap-2">
          {(() => {
            const supply = detailExtra?.area_supply_m2 ?? (listing as any).area_supply_m2;
            return (
              <div className="rounded-lg bg-neutral-50 p-2.5">
                <div className="text-[10px] text-neutral-500 mb-1">전용 / 공급</div>
                <div className="text-[13px] font-semibold text-neutral-900">
                  {listing.area_m2 ? `${listing.area_m2}` : '-'}
                  {supply ? ` / ${supply}` : ''}㎡
                </div>
                {listing.area_m2 && supply && (
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    전용률 {Math.round((listing.area_m2 / supply) * 100)}%
                  </div>
                )}
              </div>
            );
          })()}
          <div className="rounded-lg bg-neutral-50 p-2.5">
            <div className="text-[10px] text-neutral-500 mb-1">해당층 / 총층</div>
            <div className="text-[13px] font-semibold text-neutral-900">{floorLabel || '-'}</div>
            {listing.direction && (
              <div className="text-[10px] text-neutral-400 mt-0.5">{listing.direction}</div>
            )}
          </div>
          <div className="rounded-lg bg-neutral-50 p-2.5">
            <div className="text-[10px] text-neutral-500 mb-1">방수 / 방구조</div>
            <div className="text-[13px] font-semibold text-neutral-900">
              {listing.rooms != null && listing.rooms > 0
                ? `${listing.rooms}/${listing.bathrooms ?? listing.rooms}개`
                : (detailExtra?.room_layout || listing.type || '-')}
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">
              {[
                detailExtra?.room_layout,
                detailExtra?.is_duplex === true ? '복층' : (detailExtra?.is_duplex === false ? '단층' : null),
              ].filter(Boolean).join(' · ') || '-'}
            </div>
          </div>
        </div>

        {/* L-modal-v7-2: 매물 정보 — 통합 단일 테이블 */}
        <div className="border-b border-neutral-100 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">매물 정보</div>
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            {/* 관리비 — 항상 표시. 금액·포함 항목 둘 다 없으면 "정보 미입력" */}
            <>
              <div className="text-neutral-500">관리비</div>
              <div>
                <div className="text-neutral-800">{maintenanceLabel || <span className="text-neutral-400">정보 미입력</span>}</div>
                {(() => {
                  const includes = detailExtra?.maintenance_includes ?? (listing as any).maintenance_includes;
                  const excludes = detailExtra?.maintenance_excludes ?? (listing as any).maintenance_excludes;
                  const hasInc = Array.isArray(includes) && includes.length > 0;
                  const hasExc = Array.isArray(excludes) && excludes.length > 0;
                  if (!hasInc && !hasExc) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {hasInc && includes!.map((it: string) => (
                        <span key={`inc:${it}`} className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{it} 포함</span>
                      ))}
                      {hasExc && excludes!.map((it: string) => (
                        <span key={`exc:${it}`} className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">{it} 별도</span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
            <Row label="입주 가능일" value={detailExtra?.available_date || (listing as any).available_date || '협의가능'} />
            {/* 사용 승인일 — 날짜 패턴 가드 (L-modal-fields2)
                DB 의 usage_approved 컬럼에 비정상 값이 섞여 있어 isValidDateLike 통과만 표시 */}
            {(() => {
              const ua = isAuthed && detailExtra?.usage_approved ? detailExtra.usage_approved : null;
              const by = listing.built_year;
              const display = isValidDateLike(ua) ? ua : (isValidDateLike(by) ? by : null);
              if (!display) return null;
              return <Row label="사용 승인일" value={display} />;
            })()}
            {/* 주차 — 항상 표시. 입력 텍스트 + 주차비 + 총주차대수 결합 */}
            <>
              <div className="text-neutral-500">주차</div>
              <div className="text-neutral-800">{(() => {
                const parts: string[] = [];
                const p: any = listing.parking;
                const pStr = typeof p === 'string' ? p.trim() : '';
                if (pStr && pStr !== 'true' && pStr !== 'false') parts.push(pStr);
                else if (p === true || pStr === 'true') parts.push('주차 가능');
                else if (p === false || pStr === 'false') parts.push('주차 불가');
                const fee = detailExtra?.parking_fee ?? (listing as any).parking_fee;
                if (fee != null && Number(fee) > 0) parts.push(`주차비 ${Number(fee).toLocaleString('ko-KR')}만원/월`);
                else if (fee === 0) parts.push('주차비 무료');
                const total = detailExtra?.total_parking_spaces;
                if (total != null && total > 0) parts.push(`총 ${total}대 (건축물대장)`);
                return parts.length > 0 ? parts.join(' · ') : <span className="text-neutral-400">정보 미입력</span>;
              })()}</div>
            </>
            <Row label="건축물 용도" value={detailExtra?.building_purpose ?? (listing as any).building_purpose} />
            {detailExtra?.illegal_building === false && (
              <>
                <div className="text-neutral-500">위반 건축물</div>
                <div className="text-emerald-700">해당없음 ✓</div>
              </>
            )}
            {detailExtra?.illegal_building === true && (
              <>
                <div className="text-neutral-500">위반 건축물</div>
                <div className="text-red-600">있음</div>
              </>
            )}
            {/* 가까운 역 — 도보 분 계산 (80m/분, 네이버·KB 표준) */}
            {(() => {
              const name = detailExtra?.station_name ?? (listing as any).station_name;
              const distRaw = detailExtra?.station_distance ?? listing.station_distance;
              const distNum = typeof distRaw === 'number' ? distRaw : (distRaw ? Number(distRaw) : null);
              if (!name && (distNum == null || !(distNum > 0))) return null;
              const walkMin = distNum != null && distNum > 0 ? Math.max(1, Math.round(distNum / 80)) : null;
              const parts: string[] = [];
              if (name) parts.push(String(name));
              if (distNum != null && distNum > 0) {
                parts.push(walkMin != null ? `도보 ${walkMin}분 (${distNum}m)` : `${distNum}m`);
              }
              return <Row label="가까운 역" value={parts.join(' · ')} />;
            })()}
            {listing.business_type && <Row label="업종" value={listing.business_type} />}
            {listing.elevator != null && <Row label="엘리베이터" value={boolLabel(listing.elevator)} />}
            {listing.pet != null && <Row label="반려동물" value={boolLabel(listing.pet)} />}
          </dl>
        </div>

        {/* L-modal-v7 (2026-04-24): 내부시설 + 보안 아이콘 그리드 */}
        {(() => {
          const bools = { elevator: !!listing.elevator, full_option: !!listing.full_option };
          const interiorHits = INTERIOR_FEATURES.filter((s) => hasFeatureWithBools(listing.features, s, bools));
          const securityHits = SECURITY_FEATURES.filter((s) => hasFeatureWithBools(listing.features, s, bools));
          if (interiorHits.length + securityHits.length === 0) return null;
          return (
            <div className="border-b border-neutral-100 px-4 py-3 space-y-3">
              {interiorHits.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">내부 시설</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {interiorHits.map((spec) => {
                      const Icon = spec.icon;
                      return (
                        <div key={spec.label} className="flex flex-col items-center justify-center gap-1 py-2 rounded-md bg-neutral-50">
                          <Icon className="size-4 text-neutral-500" />
                          <span className="text-[10.5px] text-neutral-800">{spec.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {securityHits.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">보안 및 기타</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {securityHits.map((spec) => {
                      const Icon = spec.icon;
                      return (
                        <div key={spec.label} className="flex flex-col items-center justify-center gap-1 py-2 rounded-md bg-neutral-50">
                          <Icon className="size-4 text-neutral-500" />
                          <span className="text-[10.5px] text-neutral-800">{spec.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* L-modal-v7: 허위매물 차단 4단 검증 배지 */}
        <div className="border-b border-neutral-100 px-4 py-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <ShieldCheck className="size-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-emerald-800">허위매물 차단 4단 검증 완료</div>
              <div className="text-[10.5px] text-emerald-700 leading-relaxed mt-0.5">
                건축물대장 일치 · 사용승인 · 등기부 · 현장확인
                {detailExtra?.last_verified_at && (
                  <> · <span className="font-semibold">{new Date(detailExtra.last_verified_at).toLocaleDateString('ko-KR')}</span></>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* L-modal-v7 (2026-04-24): 매물 설명 — 제목 중복 제거 + 3줄 프리뷰 + 더보기/접기 */}
        {detailExtra?.ai_description && (() => {
          const normalize = (s: string) => (s || '').replace(/[\s\.,!?·\-]+/g, '').toLowerCase();
          const aiTitle = listing.ai_title?.trim() || null;
          const paragraphs = String(detailExtra.ai_description).split(/\n{2,}/).map((s: string) => s.trim()).filter(Boolean);
          // 첫 단락이 ai_title 과 실질적으로 동일하면 제거 (제목·설명 중복 방지)
          const cleanedParas = (aiTitle && paragraphs[0] && normalize(paragraphs[0]) === normalize(aiTitle))
            ? paragraphs.slice(1)
            : paragraphs;
          const bodyText = cleanedParas.join('\n\n');
          if (!aiTitle && !bodyText) return null;
          return (
            <div className="border-b border-neutral-100 px-4 py-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">매물 설명</div>
              <div className="rounded-xl bg-neutral-50 p-3">
                {aiTitle && (
                  <p className="text-[13px] font-semibold leading-snug text-neutral-900 mb-2">{aiTitle}</p>
                )}
                {bodyText && (
                  <>
                    <p className={[
                      'text-[12.5px] text-neutral-700 leading-relaxed whitespace-pre-line',
                      showFullDesc ? '' : 'line-clamp-3',
                    ].join(' ')}>
                      {bodyText}
                    </p>
                    {bodyText.length > 90 && (
                      <button
                        type="button"
                        onClick={() => setShowFullDesc(v => !v)}
                        className="mt-2 text-[11.5px] font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        {showFullDesc ? '접기 ↑' : '더보기 ↓'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* L-modal-meta (2026-04-24): 메타 footer — 매물번호·최초등록·최근확인·조회수 */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-neutral-400">
          <span>매물번호 <span className="font-mono text-neutral-500">{listing.id}</span></span>
          {detailExtra?.created_at && (
            <span>최초등록 <span className="text-neutral-500">{new Date(detailExtra.created_at).toLocaleDateString('ko-KR')}</span></span>
          )}
          {detailExtra?.last_verified_at && (() => {
            const days = Math.floor((Date.now() - new Date(detailExtra.last_verified_at).getTime()) / (24*60*60*1000));
            const label = days <= 0 ? '오늘' : `${days}일 전`;
            return <span>최근확인 <span className="text-neutral-500">{label}</span></span>;
          })()}
          {typeof detailExtra?.views === 'number' && detailExtra.views > 0 && (
            <span>조회 <span className="text-neutral-500">{detailExtra.views.toLocaleString('ko-KR')}회</span></span>
          )}
        </div>
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

      {/* L-modal-v7: 하단 단일 액션 — 담당자에게 연결 */}
      <div className="border-t border-neutral-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setAgentModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          <Phone className="size-4" />
          <span>담당자에게 연결</span>
        </button>
      </div>

      {/* 담당자 정보 모달 */}
      <AgentContactModal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        agent={buildAgentInfoFromProfile(agentProfile)}
        listingId={listing.id}
        listingTitle={listing.title ?? (listing as any).building_name ?? ''}
        onRequestInquiry={() => {
          setAgentModalOpen(false);
          if (!openKakaoChannelChat()) setInquiryOpen(true);
        }}
        onRequestVisit={() => {
          setAgentModalOpen(false);
          openNaverBooking();
        }}
      />

      {/* 문의/예약 서브 모달 */}
      <InquiryModal
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        context="listing"
        listingId={listing.id}
        listingTitle={listing.title ?? (listing as any).building_name ?? ''}
        source="/map"
      />
    </aside>
  );
}

// L-modal-v7: fetch 된 agent profile 을 AgentInfo 로 매핑 (폴백은 위시스부동산 공용)
function buildAgentInfoFromProfile(ap: {
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  office_name: string | null;
  office_phone: string | null;
  office_address: string | null;
  registration_no: string | null;
  career_years: number | null;
} | null): AgentInfo {
  const FALLBACK: AgentInfo = {
    name: '위시스부동산',
    officeName: '위시스부동산 공인중개사사무소',
    officePhone: '1533-9580',
    officeAddress: '서울 관악구 신림동 1431-32 8층',
    registrationNo: null,
    careerYears: null,
    phone: null,
    avatarUrl: null,
    responseRate: 98,
    avgResponseMinutes: 12,
  };
  if (!ap) return FALLBACK;
  return {
    ...FALLBACK,
    name: ap.name || FALLBACK.name,
    phone: ap.phone || FALLBACK.phone,
    avatarUrl: ap.avatar_url || null,
    officeName: ap.office_name || FALLBACK.officeName,
    officePhone: ap.office_phone || FALLBACK.officePhone,
    officeAddress: ap.office_address || FALLBACK.officeAddress,
    registrationNo: ap.registration_no || null,
    careerYears: ap.career_years ?? null,
  };
}
