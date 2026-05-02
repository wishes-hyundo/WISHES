// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HtmlMarkerOverlay — L-mapmarker2 (2026-04-23)
// 네이버·직방·다방 스타일 HTML 마커.  통일 스타벅스 그린 컬러.
//
// 본 L-mapmarker2 리비전의 변경점:
//   1) 카테고리별 색 분기 제거 → 스타벅스 그린 #006241 로 통일 (불투명 0.88).
//   2) 테두리 흰색 → 채움과 동일 hex (진한 그린) 로 통일, 시각 정돈.
//   3) 줌 기반 grid clustering — Kakao level 에 따라 셀 크기 가변.
//      멀리서 보면 한 원 안에 수십~수백 개 매물 개수가 합쳐짐.
//      가까이 줌인하면 개별 매물로 풀림 (네이버·직방 방식).
//   4) 카테고리 탭 필터 — 주거/상가사무실/토지 탭이 활성일 때 해당 type 의
//      매물만 렌더.  '투자' 탭은 cross-cutting 이라 필터 해제 (전부 표시).
//   5) Tier1 pill (같은 아파트·오피스텔 단지) 은 근거리 줌 (level ≤ 4) 에서만
//      유지.  멀리서는 grid cluster 가 대신 합침.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { MapListing, PropertyCategory } from '@/features/map-2026/store';
import { bucketListings, listingCategory } from '@/features/map-2026/lib/markerTier';
import { kakaoFlyTo } from '@/features/map-2026/lib/cinematicMotion';

// ── 컬러 토큰 ──────────────────────────────────────────────────────
// L-naver-2026catcolor1 (2026-04-27): 카테고리별 색상 구분 (사용자 요청).
//   주거 → 스타벅스 그린 (기존 브랜드)
//   상가/사무실 → 앰버 (warm, 비즈니스 인상)
//   토지 → 다크 브라운 (땅 색)
//   투자 → 퍼플 (cross-cutting, 차별화)
//   투명도: 0.82 → 0.68 (사용자 요청 더 투명).
const CAT_COLORS: Record<'residence' | 'retail_office' | 'land' | 'investment', { fg: string; bg: string }> = {
  residence:    { fg: '#006241', bg: 'rgba(0,98,65,0.68)' },     // 그린
  retail_office:{ fg: '#b45309', bg: 'rgba(180,83,9,0.68)' },    // 앰버
  land:         { fg: '#78350f', bg: 'rgba(120,53,15,0.68)' },   // 다크 브라운
  investment:   { fg: '#7e22ce', bg: 'rgba(126,34,206,0.68)' },  // 퍼플
};
const BRAND_GREEN = CAT_COLORS.residence.fg;
const BRAND_GREEN_BG = CAT_COLORS.residence.bg;  // backward compat (단지 pill 등)
const SEL_BG = '#185FA5';     // 선택 상태: WISHES 브랜드 블루
const SEL_BD = '#0C447C';
const SEL_SHADOW = '0 4px 14px rgba(24,95,165,0.45)';
const DEFAULT_SHADOW = '0 2px 6px rgba(0,0,0,0.22)';

// Kakao SDK 타입 최소 선언.
interface KakaoCustomOverlay {
  setMap: (m: unknown) => void;
}
interface KakaoMapLike {
  getLevel?: () => number;
}
interface KakaoEventNs {
  addListener: (t: unknown, type: string, cb: () => void) => void;
  removeListener?: (t: unknown, type: string, cb: () => void) => void;
}
interface KakaoLatLngBoundsLike {
  extend: (latlng: unknown) => void;
}
interface KakaoMapsNs {
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new (sw?: unknown, ne?: unknown) => KakaoLatLngBoundsLike;
  event: KakaoEventNs;
}
interface KakaoNamespace {
  maps?: KakaoMapsNs;
}

/** 서버 사전집계 클러스터 (rpc_map_clusters 응답) */
export interface ServerClusterInput {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  sample_ids?: number[] | null;
}

interface Props {
  map: unknown;
  listings: MapListing[];
  selectedListingId: number | null;
  /** 상단 카테고리 탭 상태.  'investment' 는 필터 해제(전부 표시). */
  category: PropertyCategory;
  onClickListing: (id: number) => void;
  /** 선택: 단지 pill 클릭 시 단지 drawer 오픈.  없으면 첫 매물 상세로 폴백. */
  onClickComplex?: (name: string, listings: MapListing[]) => void;
  /** 선택: cluster (count ≥ 2) 클릭 시 리스트 drawer.  없으면 첫 매물 상세. */
  onClickCluster?: (listings: MapListing[]) => void;
  /** L-worldclass1 (2026-04-24 pm): 서버 사전집계 클러스터.
   *  제공되면 이 데이터로 카운트 원을 그린다 — 클라이언트 grid 클러스터링 우회.
   *  /api/map/clusters (rpc_map_clusters) 에서 Quadkey 캐시 + H3 MV 집계 결과. */
  serverClusters?: ServerClusterInput[];
  /** L-clusterexact1 (2026-04-24 pm): 클러스터 클릭 시 "정확히 N개 매물만" 필터.
   *  ids 배열을 받아 사이드바·지도에 그 매물만 남긴다. null 이면 해제. */
  onClusterFilter?: (ids: number[] | null, label?: string | null) => void;
  clusterFilterIds?: number[] | null;
  /** L-clusterexact3 (2026-04-24 pm): /api/listings/by-ids 로 fetch 한 정확한 매물.
   *  viewport listings 에 없는 id 도 포함되므로 100% 정확한 N개 렌더 가능. */
  clusterFilterListings?: MapListing[] | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-naver-zoomscale1 (2026-05-02, 사장님 명령 — "줌 단계에 맞게 세밀 조정")
//
// 마커 동그라미 사이즈는 (1) count, (2) Kakao level (zoom), (3) 모바일 여부
// 세 차원으로 결정한다. 이전엔 count + 모바일만 고려해서 줌인/줌아웃 시 마커가
// 같은 크기로 보여 사용자가 "줌 단계에 안 맞다"고 지적.
//
// 핵심 원칙:
//   · 모바일 최소 44px (WCAG 2.2 + iOS 권장 터치 타겟)
//   · 줌인 (level 1-3): 단일 매물/단지 식별 우선 — 큰 사이즈 (1.10~1.35x)
//   · 표준 줌 (level 4-5): 기본 사이즈 (1.0x)
//   · 줌아웃 (level 6-9): 점진 압축 (0.88~0.95x)
//   · 광역/전국 (level 10+): 클러스터 강조, 작은 카운트는 추가 압축 (0.82x × 0.88)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 줌 + count + 모바일 기반 마커 동그라미 px 사이즈.
 * 모든 마커 렌더 코드는 본 함수 한 곳에서 사이즈를 결정 (DRY).
 */
function markerSize(opts: {
  count: number;
  level: number;
  isMobile: boolean;
}): number {
  const { count, level, isMobile } = opts;

  // ── 1) Base size (count 기반) ──
  const baseDesktop =
    count >= 1000 ? 80 :
    count >= 500  ? 68 :
    count >= 100  ? 56 :
    count >= 50   ? 48 :
    count >= 20   ? 42 :
    count >= 10   ? 36 :
    count >= 2    ? 30 :
                    26;
  const baseMobile =
    count >= 1000 ? 64 :
    count >= 500  ? 54 :
    count >= 100  ? 44 :
    count >= 50   ? 38 :
    count >= 20   ? 34 :
    count >= 10   ? 30 :
    count >= 2    ? 26 :
                    22;
  const base = isMobile ? baseMobile : baseDesktop;

  // ── 2) Zoom multiplier (Kakao level 1=가까움 ~ 14=전국) ──
  let mult: number;
  if (level <= 1)      mult = 1.35;  // z19 단지내 — 단일 매물 식별 강조
  else if (level <= 2) mult = 1.20;  // z18 단지
  else if (level <= 3) mult = 1.10;  // z17 인근 단지 묶음
  else if (level <= 5) mult = 1.00;  // z16-15 동/기본 줌 — 표준
  else if (level <= 6) mult = 0.95;  // z14
  else if (level <= 7) mult = 0.92;  // z13
  else if (level <= 9) mult = 0.88;  // z12-11 광역
  else                 mult = 0.82;  // z10- 시도/전국

  // ── 3) 줌아웃 시 작은 클러스터 추가 압축 (시각 노이즈 감소) ──
  if (level >= 8 && count < 10) mult *= 0.88;

  let size = Math.round(base * mult);

  // ── 4) 모바일 최소 44px (WCAG 2.2 AAA + iOS 권장 터치 타겟) ──
  if (isMobile && size < 44) size = 44;

  // ── 5) 데스크탑 최소 24px (가독성) ──
  if (!isMobile && size < 24) size = 24;

  // ── 6) 최대 사이즈 캡 (overflow 방지) ──
  const maxSize = isMobile ? 96 : 110;
  if (size > maxSize) size = maxSize;

  return size;
}

/** 사이즈에 비례한 카운트 텍스트 폰트 사이즈. 사이즈 22~110 매핑. */
function markerFontSize(size: number): string {
  if (size >= 80) return '16px';
  if (size >= 64) return '15px';
  if (size >= 52) return '14px';
  if (size >= 42) return '13px';
  if (size >= 32) return '12px';
  if (size >= 26) return '11px';
  return '10px';
}

// Kakao level(1~14) → 그리드 셀 크기 (위경도 degree).
// level 1 (가장 가까움) ~ level 14 (가장 멀음).  1 deg lat ≈ 111km.
//   level ≤ 2  → 0 (클러스터링 해제, 개별 표시)
//   level 3    → ~200m
//   level 4    → ~400m
//   level 5    → ~1km (/map 기본 줌)
//   level 6    → ~2km
//   level 7    → ~4km
//   level 8    → ~8km
//   level 9+   → ~15km (행정구 단위)
function gridSizeForLevel(level: number): number {
  // L-cluster1 (2026-04-23 p.m.): 광역 뷰(level 8+) 에서 강남 전체가 하나의
  //   4.1k 덩어리로 뭉쳐 보이던 현상 수정.
  // L-mapmarker2b (2026-04-24 pm): 국토 뷰(level 10+) 에서 4,000+ 매물이
  //   2개 덩어리로 뭉쳐 보이던 문제 추가 수정. 셀을 더 쪼개 시/도/권역별로
  //   분리되도록 조정.
  // L-mapmarker2c (2026-04-24 pm): 최대확대에서도 건물 단위로 뭉쳐 주소 정확 노출 방지.
  //   사용자 피드백 — 개별 점으로 찍히면 경쟁사·직거래 유출 리스크.
  // L-naver-cluster1 (2026-04-26): 네이버 부동산 z16~z19 매칭 close-up 미세조정.
  //   네이버 z19 (Kakao level 1) = 동·호수 단위 / z18 (level 2) = 단지 1개 / z17 (level 3) = 인근 단지 묶음 / z16 (level 4) = 동네 묶음.
  // L-mapfix-2026-05-02 (사장님 명령 — 가까이 줌인 시 매물 단독 표시):
  //   level 1~2 (z18+, 가장 가까운 줌) 에서 grid 비활성화 (cellSize=0).
  //   매물별 단독 마커 (좌표가 정확히 같은 매물만 자동으로 한 점에 겹침 — 같은 호수 매물).
  //   level 3+ 부터 일반 grid 활성화 (광역 뷰 시각 노이즈 방지).
  //
  //   이전 PR #74 의 9m cellSize 도 큰 건물 (오피스텔 한 동) 안 매물 다 묶었음.
  //   사장님 본 거동: 18~32개 매물이 1마커로 → 사용 어려움.
  // L-grid-precision1 (사장님 명령 2026-05-02 — 끝판왕 마커 위치 정확도):
  //   기존: level 6 = 1.1km grid → 한 cell 에 여러 단지 매물 들어가서 centroid 가
  //         단지 사이 빈 공간에 표시 → 시각상 "균일 배치" 보임 (직방/네이버 ≠).
  //   수정: cellSize 약 1/3 ~ 1/2 로 축소 → 단지 단위 그룹 + centroid 가 단지 좌표에 가깝게.
  //   직방/네이버 z14 표준 ~200m grid (단지·빌딩 단위).
  if (level <= 2) return 0;          // 가장 가까이 — 매물별 단독 (같은 좌표 자연 그룹)
  if (level <= 3) return 0.00060;    // ~66m (인근 골목, 동일)
  if (level <= 4) return 0.0010;     // ~110m (220m → 110m, 단지 단위)
  if (level <= 5) return 0.0020;     // ~220m (440m → 220m)
  if (level <= 6) return 0.0040;     // ~440m (1.1km → 440m, 단지 분리)
  if (level <= 7) return 0.0080;     // ~880m (1.8km → 880m)
  if (level <= 8) return 0.0140;     // ~1.5km (2.7km → 1.5km)
  if (level <= 9) return 0.0220;     // ~2.4km (3.9km → 2.4km)
  if (level <= 10) return 0.035;     // ~3.9km (5km → 3.9km)
  if (level <= 11) return 0.050;     // ~5.5km
  if (level <= 12) return 0.075;     // ~8.3km
  return 0.110;                      // ~12km (level 13+ 전국 뷰)
}

/** 카운트 표시 원 — 단일 매물이면 '1', 클러스터면 N.
 *  L-naversize1 (2026-04-26): 사이즈 차이 확장 (네이버 스타일).
 *  size 인자가 직접 지정되지만, font-size 는 count 별로 자동 결정. */
function makeCircleElement(opts: {
  count: number;
  selected: boolean;
  size: number;
  category?: 'residence' | 'retail_office' | 'land' | 'investment';
}): HTMLDivElement {
  const { count, selected, size, category = 'residence' } = opts;
  const cc = CAT_COLORS[category];
  const bg = selected ? SEL_BG : cc.bg;
  const bd = selected ? SEL_BD : cc.fg;
  const el = document.createElement('div');
  const fontSize = markerFontSize(size);
  // L-naver-2026clusterselected1 (2026-04-27): selected 시각 효과 강화.
  //   ① 살짝 커짐 (1.15x)  ② ring 효과 (outline + offset)  ③ z-index 우선
  //   사용자: "눌렀다는 걸 알 수 있는 상태" 명확하게.
  const baseScale = selected ? 1.15 : 1;
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:50%',
    `background:${bg}`,
    'color:#fff',
    selected ? `border:3px solid ${bd}` : 'border:none',
    selected ? `outline:3px solid rgba(24,95,165,0.35); outline-offset:2px` : '',
    `box-shadow:${selected ? '0 6px 20px rgba(24,95,165,0.55), 0 2px 4px rgba(0,0,0,0.18)' : '0 4px 14px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.12)'}`,
    `font-size:${fontSize}`,
    'font-weight:800',
    'letter-spacing:-0.3px',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
    `transform:scale(${baseScale})`,
    'font-family:inherit',
    'pointer-events:auto',
    selected ? 'z-index:50' : '',
  ].filter(Boolean).join(';');
  el.textContent = count >= 1000 ? `${(Math.floor(count / 100) / 10).toFixed(1)}k` : String(count);
  el.addEventListener('mouseenter', () => { el.style.transform = `scale(${baseScale * 1.08})`; });
  el.addEventListener('mouseleave', () => { el.style.transform = `scale(${baseScale})`; });
  return el;
}

/** 단지 pill — 같은 building_name 에 ≥2개 있을 때 한 번에 표시. */
function makePillElement(opts: {
  name: string;
  count: number;
  selected: boolean;
}): HTMLDivElement {
  const { name, count, selected } = opts;
  const bg = selected ? SEL_BG : '#fff';
  const bd = selected ? SEL_BD : BRAND_GREEN;
  const fg = selected ? '#fff' : '#1a1a1a';
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    `background:${bg}`,
    'border-radius:999px',
    'padding:5px 4px 5px 12px',
    'font-size:12px',
    'font-weight:600',
    `color:${fg}`,
    `border:1.5px solid ${bd}`,
    `box-shadow:${selected ? SEL_SHADOW : DEFAULT_SHADOW}`,
    'white-space:nowrap',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
    'letter-spacing:-0.2px',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:${selected ? '#fff' : BRAND_GREEN};flex-shrink:0;`;
  el.appendChild(dot);

  const label = document.createElement('span');
  label.textContent = name;
  el.appendChild(label);

  const badge = document.createElement('span');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `background:${selected ? 'rgba(255,255,255,0.22)' : BRAND_GREEN_BG}`,
    'color:#fff',
    'border-radius:999px',
    'padding:1px 7px',
    'font-size:11px',
    'font-weight:700',
    'margin-left:8px',
    'min-width:20px',
  ].join(';');
  badge.textContent = String(count);
  el.appendChild(badge);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.06)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

export default function HtmlMarkerOverlay({
  map,
  listings,
  selectedListingId,
  category,
  onClickListing,
  onClickComplex,
  onClickCluster,
  serverClusters,
  onClusterFilter,
  clusterFilterIds,
  clusterFilterListings,
}: Props) {
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNamespace }).kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const cleanupOverlays = () => {
      for (const ov of overlaysRef.current) {
        try { ov.setMap(null); } catch { /* noop */ }
      }
      overlaysRef.current = [];
    };

    const render = () => {
      cleanupOverlays();
      if (!Array.isArray(listings) || listings.length === 0) return;

      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;

      // L-clusterexact1 + L-clusterexact3 (2026-04-24 pm):
      //   · clusterFilterListings 있으면 (by-ids fetch 완료) 그걸 그대로 visibleListings
      //   · 없으면 clusterFilterIds 교집합 (hydrate 대기 임시)
      //   · 필터 자체가 없으면 일반 listings
      const filterSet = clusterFilterIds && clusterFilterIds.length > 0
        ? new Set(clusterFilterIds)
        : null;
      const visibleListings = clusterFilterListings && clusterFilterListings.length > 0
        ? clusterFilterListings
        : (filterSet ? listings.filter((l) => filterSet.has(l.id)) : listings);
      if (visibleListings.length === 0 && !filterSet) return;

      // L-adminpoly1 + L-chipexclusive1 + L-naverstyle5 + L-granularity1 +
      // L-closeview1 (2026-04-24 pm):
      //   네이버 4단계 행정구역 체계.  AdminRegionOverlay 가 다음을 담당:
      //     · level ≥ 11 : 시/도 chip (17 개)
      //     · level 8~10 : 시/군/구 chip (~250 개)
      //     · level 4~7  : 읍/면/동 chip (~3500 개, viewport filter + top 25)
      //   HtmlMarkerOverlay 는 level ≤ 3 (근거리) 에서 활성화 → 단지 pill + 개별 원.
      //
      // L-closeview1: 경계를 2 → 3 으로 확장.  이전에는 level 3 (250m) 에서
      //   동 chip 만 뜨는데, viewport 가 한 동 안에 완전히 들어가면 "역삼1동
      //   347" 같은 큰 chip 하나만 보였다 (사용자 피드백 "더 엉망진창").
      //   250m 는 개별 건물·단지 마커가 훨씬 직관적인 줌 수준.
      // L-naver-zoom2 (2026-04-26 night): 정밀 보정 — Naver z16+ 매물 마커 = Kakao level ≤4.
      //   동 폴리곤은 level 5~7 (z13~z15), 마커는 level 1~4 (z16~z19).
      // L-naver-zoom4 (2026-04-26 night): 마커 영역 level 1-4 (z16-z19) 유지.  level 5 는 dong 폴리곤.
      if (level >= 5) return;

      // ━━ L-worldclass1 (2026-04-24 pm): 서버 사전집계 클러스터 우선 경로 ━━
      //   serverClusters 가 제공되면 클라이언트 grid 클러스터링을 완전히 건너뛰고
      //   바로 카운트 원을 렌더한다.  listings[] 는 ListPanel 용으로만 쓰이고
      //   지도 마커는 /api/map/clusters 의 pre-aggregated 결과로만 그림.
      // L-clusterexact1 (2026-04-24 pm): filterSet 이 활성화되면 서버 경로 skip →
      //   grid 경로에서 정확한 visibleListings 만 렌더.
      // L-naverstyle7 + L-closeview1 (2026-04-24 pm): 격자 배치 제거.
      //   serverClusters (H3/Quadkey 셀 중심) 을 근거리 뷰에서 그대로 쓰면
      //   시각적 격자 배치가 됨 → client-side bucketListings (building_name /
      //   dong+type centroid) 으로 대체.
      //   상단 `if (level >= 4) return;` 때문에 이 블록은 사실상 dead path 지만
      //   향후 level 정책 변경 시 보호 차원에서 명시적 가드 유지.
      // L-naver-2026noserver1 (2026-04-26): server cluster path 비활성.
      //   사용자 피드백: server H3 cluster 가 client grid cluster 를 가려서
      //   네이버 매칭 변경 안 보임.  client grid path 만 사용.
      const SERVER_CLUSTER_DISABLED = true;
      if (!SERVER_CLUSTER_DISABLED && level > 3 && !filterSet && Array.isArray(serverClusters) && serverClusters.length > 0) {
        // 개별(count===1) 은 sample_ids 로 listing id 추론 가능.
        const listingById = new Map<number, MapListing>();
        for (const l of listings) listingById.set(l.id, l);
        for (const c of serverClusters) {
          const count = c.count;
          const isSingle = count === 1;
          const singleId = isSingle && c.sample_ids && c.sample_ids.length > 0
            ? c.sample_ids[0]
            : null;
          const single = singleId != null ? listingById.get(singleId) : undefined;
          const selected = singleId != null && selectedListingId === singleId;
          // L-naver-zoomscale1 (2026-05-02): 줌 단계까지 고려한 사이즈.
          const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
          const size = markerSize({ count, level, isMobile: isMobileViewport });
          const el = makeCircleElement({ count, selected, size });
          // L-clusterexact1 (2026-04-24 pm): dblclick 시 지도가 가로채 zoom 하는
          //   Kakao 기본 동작 차단.  마커 DOM 에서 mousedown 도 stop 해야 함.
          el.addEventListener('mousedown', (e) => e.stopPropagation());
          el.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            // L-clusterfit1 + L-clusterexact1 (2026-04-24 pm):
            //   · count === 1: 단일 매물 상세 모달
            //   · count ≥ 2: ① bbox 내 listings 를 id 추출 → onClusterFilter(ids)
            //     ② map.setBounds 로 그 영역 확대.  사이드바·지도 모두 N개 매물만
            //     표시되어 "4개 마커 클릭 → 4개만 보임" 사용자 기대에 부합.
            if (isSingle && singleId != null) {
              onClickListing(singleId);
              return;
            }
            try {
              const kakaoAny = (window as unknown as {
                kakao?: { maps?: {
                  LatLng?: new (lat: number, lng: number) => unknown;
                  LatLngBounds?: new (sw?: unknown, ne?: unknown) => KakaoLatLngBoundsLike;
                } };
              }).kakao;
              const mapApi = mapInst as {
                setLevel?: (n: number, opt?: unknown) => void;
                getLevel?: () => number;
                panTo?: (pos: unknown) => void;
                setBounds?: (b: unknown, t?: number, r?: number, bo?: number, l?: number) => void;
              };
              const curLevel = typeof mapApi.getLevel === 'function' ? mapApi.getLevel() : 5;
              const cellHalf = Math.max(0.0005, gridSizeForLevel(curLevel) * 0.55);
              // L-clusterexact1 + L-clusterexact2 (2026-04-24 pm): clusterFilter 세팅.
              //   우선순위:
              //     ① c.sample_ids (count <= 30 이면 전체 id — RPC L-clusterexact2)
              //     ② bbox 내 listings filter (폴백, count > 30 대형 클러스터 또는
              //        RPC 가 아직 이전 버전인 경우)
              if (onClusterFilter) {
                if (c.sample_ids && c.sample_ids.length > 0 && c.sample_ids.length >= c.count) {
                  // 정확한 전체 id (count 과 일치 확인)
                  onClusterFilter(c.sample_ids);
                } else {
                  const idsInBbox: number[] = [];
                  for (const l of listings) {
                    if (
                      l.lat >= c.lat - cellHalf && l.lat <= c.lat + cellHalf &&
                      l.lng >= c.lng - cellHalf && l.lng <= c.lng + cellHalf
                    ) idsInBbox.push(l.id);
                  }
                  // sample_ids 가 있지만 count 보다 적으면 (대형 클러스터: 30 cap)
                  // sample_ids 와 bbox 매물의 union 으로 보강
                  if (c.sample_ids && c.sample_ids.length > 0) {
                    const union = new Set(idsInBbox);
                    for (const id of c.sample_ids) union.add(id);
                    onClusterFilter(Array.from(union));
                  } else if (idsInBbox.length > 0) {
                    onClusterFilter(idsInBbox);
                  }
                }
              }
              if (
                kakaoAny?.maps?.LatLng &&
                kakaoAny?.maps?.LatLngBounds &&
                typeof mapApi.setBounds === 'function'
              ) {
                const sw = new kakaoAny.maps.LatLng(c.lat - cellHalf, c.lng - cellHalf);
                const ne = new kakaoAny.maps.LatLng(c.lat + cellHalf, c.lng + cellHalf);
                const bounds = new kakaoAny.maps.LatLngBounds(sw, ne);
                mapApi.setBounds(bounds, 40, 40, 40, 40);
                return;
              }
              // 폴백: setBounds 미지원 → 기존 panTo + setLevel(-2)
              const nextLevel = Math.max(1, curLevel - 2);
              if (kakaoAny?.maps?.LatLng && typeof mapApi.panTo === 'function') {
                mapApi.panTo(new kakaoAny.maps.LatLng(c.lat, c.lng));
              }
              if (typeof mapApi.setLevel === 'function') {
                mapApi.setLevel(nextLevel);
              }
            } catch { /* 폴백: 아무것도 안 함 */ }
          });
          try {
            const ov = new maps.CustomOverlay({
              position: new maps.LatLng(c.lat, c.lng),
              content: el,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 10,
              clickable: true,
            });
            ov.setMap(map);
            overlaysRef.current.push(ov);
          } catch { /* SDK race — skip */ }
        }
        return;  // 서버 클러스터 모드: 아래 grid 로직 실행 안 함
      }

      // 카테고리 필터 — 'investment' 는 cross-cutting 이므로 필터 해제.
      //   L-clusterexact1: visibleListings (clusterFilterIds 적용 후) 기준.
      // L-mapfix-2026-05-02 (사장님 명령): cluster filter active 시 카테고리 skip
      //   (사용자가 클러스터 클릭 = 그 영역 전체 매물 보고 싶다는 의도).
      const isClusterFilterActive = !!filterSet
        || !!(clusterFilterListings && clusterFilterListings.length > 0);
      const filtered = (category === 'investment' || isClusterFilterActive)
        ? visibleListings
        : visibleListings.filter((l) => listingCategory(l.type) === category);
      if (filtered.length === 0) return;

      // L-naver-2026gridcluster1 (2026-04-26): 네이버 부동산 정확 매칭.
      //   사용자 피드백 "네이버랑 배치 기준이 다르다" — 네이버는 viewport
      //   grid cell 기반 cluster (단지명 무시).  WISHES 의 building_name 기반
      //   centroid 단지 pill 은 단지가 많을 때 동그라미 과다 + 위치 부정확.
      //   해결: bucketListings 우회 → 모든 매물 = rest (grid cluster 대상).
      const tier1Groups: ReturnType<typeof bucketListings>['tier1Groups'] = [];
      const rest: MapListing[] = filtered;

      // ── Tier 1 그룹 렌더 ──
      // L-naverstyle9 (2026-04-25): 네이버 부동산 스타일 통일.
      //   네이버는 단지명 / 동 이름 등 텍스트 라벨을 마커에 넣지 않고
      //   "파란 원형 + 숫자" 만 표시.  카카오 지도 자체에 단지·건물명
      //   라벨이 풍부하므로 중복 정보 제거 + 시각적 노이즈 절감.
      //
      //   bucketListings 의 두 그룹 (b: building_name, d: dong+type) 모두
      //   동일하게 makeCircleElement 로 렌더.  단지명은 클릭 시 drawer 로
      //   확인.  group.name 은 click handler 에서만 활용.
      for (const g of tier1Groups) {
        const selected =
          selectedListingId != null && g.listings.some((l) => l.id === selectedListingId);
        const isBuildingPill = g.key.startsWith('b:');
        // L-naver-pill1 (2026-04-26): 사용자 피드백 "마커 배치가 네이버랑 다르다" —
        //   네이버 부동산은 단지명 + 매물수 pill 형태 (예: "관악아파트 9").
        //   단지명 (b:) 그룹은 pill, dong+type (d:) 그룹은 동그라미 fallback.
        const el: HTMLDivElement = isBuildingPill && g.name
          ? makePillElement({ name: g.name, count: g.count, selected })
          : (() => {
              const isMobileViewportT = typeof window !== 'undefined' && window.innerWidth < 768;
              const size = markerSize({ count: g.count, level, isMobile: isMobileViewportT });
              return makeCircleElement({ count: g.count, selected, size });
            })();
        // L-tooltip1 (2026-04-26): 마커 hover tooltip — 단지명/지역명 표시.
        if (g.name) el.title = `${g.name} (${g.count.toLocaleString()})`;
        // L-clickfix1 (2026-04-25): mousedown/dblclick 잡아 Kakao 기본 더블클릭
        //   zoom 이 클릭을 가로채는 문제 차단.
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          // L-clusterfix1 (2026-04-25): 단일 매물이면 detail modal, 클러스터면
          //   사이드바 필터 + 줌인.  이전에는 onClickCluster prop 미전달 시
          //   "엉뚱한 첫 매물 모달" 이 떠서 사용자 혼란 (피드백 #4).
          // L-complexlabel1 (2026-04-26): 마커 클릭 시 단지명/지역명 라벨 추가
          // 단지명 (b:) 그룹: 단일이면 모달, 다수면 단지 drawer
          if (isBuildingPill) {
            if (g.count === 1 && g.listings[0]) {
              onClickListing(g.listings[0].id);
              return;
            }
            if (onClickComplex) {
              onClickComplex(g.name, g.listings);
              return;
            }
          }
          // dong+type (d:) 그룹 OR 단지 drawer 미제공:
          //   단일이면 모달, 다수면 cluster filter + 줌인 setBounds
          if (g.count === 1 && g.listings[0]) {
            onClickListing(g.listings[0].id);
            return;
          }
          // 다수 매물 — onClickCluster 가 있으면 그걸 우선 (legacy)
          if (onClickCluster && g.listings.length > 1) {
            onClickCluster(g.listings);
            return;
          }
          // onClusterFilter + setBounds 폴백 — N개 매물만 사이드바·지도 필터
          //   L-complexlabel1: g.name 을 label 로 함께 전달 (단지명 또는 동+타입)
          if (onClusterFilter) onClusterFilter(g.listings.map((l) => l.id), g.name || null);
          try {
            const kakaoAny = (window as unknown as {
              kakao?: { maps?: {
                LatLng?: new (lat: number, lng: number) => unknown;
                LatLngBounds?: new (sw?: unknown, ne?: unknown) => KakaoLatLngBoundsLike;
              } };
            }).kakao;
            const mapApi = mapInst as {
              setBounds?: (b: unknown, t?: number, r?: number, bo?: number, l?: number) => void;
            };
            if (kakaoAny?.maps?.LatLng && kakaoAny?.maps?.LatLngBounds && typeof mapApi.setBounds === 'function') {
              let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
              for (const l of g.listings) {
                if (l.lat < minLat) minLat = l.lat;
                if (l.lat > maxLat) maxLat = l.lat;
                if (l.lng < minLng) minLng = l.lng;
                if (l.lng > maxLng) maxLng = l.lng;
              }
              if (minLat === maxLat && minLng === maxLng) {
                // 같은 좌표 다수 매물 → 첫 매물 모달
                onClickListing(g.listings[0].id);
                return;
              }
              const MIN_HALF = 0.00035;
              const latPad = Math.max(MIN_HALF, (maxLat - minLat) * 0.15);
              const lngPad = Math.max(MIN_HALF, (maxLng - minLng) * 0.15);
              const sw = new kakaoAny.maps.LatLng(minLat - latPad, minLng - lngPad);
              const ne = new kakaoAny.maps.LatLng(maxLat + latPad, maxLng + lngPad);
              const bounds = new kakaoAny.maps.LatLngBounds(sw, ne);
              mapApi.setBounds(bounds, 40, 40, 40, 40);
            }
          } catch { /* SDK race — noop */ }
        });
        try {
          // L-zorder1 (2026-04-26): zIndex 를 count 비례로 — 큰 마커가 위로
          const zBase = isBuildingPill ? 11 : 10;
          const zBoost = g.count >= 100 ? 5 : g.count >= 10 ? 3 : g.count >= 2 ? 1 : 0;
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(g.lat, g.lng),
            content: el,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: zBase + zBoost,
            clickable: true,
          });
          ov.setMap(map);
          overlaysRef.current.push(ov);
        } catch { /* SDK race — skip */ }
      }

      // L-naver-2026gridcluster1 (2026-04-26): grid cell snap 활성화.
      //   이전 L-naverstyle4 가 격자 제거했지만 사용자 재요청 "네이버랑 똑같이".
      //   네이버 부동산 = viewport grid cluster (cell 단위 1 동그라미).
      //   cellSize 는 zoom level 별 fine-tune (gridSizeForLevel — L-naver-cluster1).
      const clusters = new Map<string, MapListing[]>();
      // L-mapfix-2026-05-02 (사장님 명령 — "다시 마커가 합쳐지고"):
      //   cluster filter active (사용자가 클러스터 클릭한 상태) 시 grid 비활성화.
      //   사용자 의도 = "이 영역의 매물 N개 각각 보기" 인데 grid 가 다시 묶으면
      //   다시 같은 마커 1-2개로 압축돼 사용성 매우 떨어짐.
      //   cluster filter 해제 시 일반 grid 동작 (광역 뷰 시각 노이즈 방지).
      const cellSize = isClusterFilterActive ? 0 : gridSizeForLevel(level);
      // L-cluster-building1 (2026-05-02 사장님 명령 — 직방/네이버 표준):
      //   사장님 z19 발견 — 21 마커가 다른 주소 매물을 묶음.
      //   원인: 좌표 마스킹 110m 으로 다른 단지 매물도 같은 좌표 → 1 클러스터.
      //   수정: building_name (단지명) 우선 cluster key. 같은 단지명 매물만 그룹,
      //         단지명 다르면 좌표/cell 같아도 분리.
      //   INVARIANT I-MARKER-2: 같은 단지명 매물 1 마커 / 다른 단지명 매물 분리.
      //   직방/네이버 z19~z14 모두 단지 단위 표시 — WISHES 동일 표준.
      //
      // L-cluster-token1 (사장님 명령 2026-05-02): cluster_token (단지명 hash) 우선.
      //   비로그인엔 building_name 노출 X — 그러나 cluster_token (hash) 은 노출.
      //   같은 단지명 = 같은 token → 1 cluster. 다른 단지명 = 다른 token → 분리.
      //   서버: viewport / by-ids route 의 buildClusterToken() 이 응답에 포함.
      //   정규화 — '\u00A0' (NBSP) / 다중 공백 / 공백을 한 칸으로.
      const normName = (s: string | null | undefined): string =>
        (s ?? '').replace(/\s+/g, ' ').trim();
      const buildKey = (
        l: { building_name?: string | null; cluster_token?: string | null; lat: number; lng: number },
        fallbackPrefix: string,
      ): string => {
        // 1) cluster_token (서버 hash) 우선 — 비로그인/로그인 모두 작동
        if (l.cluster_token) return `t:${l.cluster_token}`;
        // 2) building_name (로그인 시 노출) — token 없으면 사용
        const n = normName(l.building_name);
        if (n) return `b:${n}`;
        // 3) fallback (좌표/cell)
        return fallbackPrefix;
      };

      if (cellSize > 0) {
        for (const l of rest) {
          const fallback = `g:${Math.floor(l.lat / cellSize)}:${Math.floor(l.lng / cellSize)}`;
          const key = buildKey(l, fallback);
          const arr = clusters.get(key);
          if (arr) arr.push(l);
          else clusters.set(key, [l]);
        }
      } else {
        // L-cluster-coord-stack1 (2026-05-02): cellSize=0 일 때도 단지명 우선,
        //   단지명 없는 매물만 (lat,lng) 동일 그룹.
        for (const l of rest) {
          const fallback = `c:${l.lat}:${l.lng}`;
          const key = buildKey(l, fallback);
          const arr = clusters.get(key);
          if (arr) arr.push(l);
          else clusters.set(key, [l]);
        }
      }

      // L-naver-2026clusterselected1 (2026-04-27): selected 판정 강화.
      //   selectedListingId 매칭 + clusterFilterIds 가 정확히 cluster 안 매물 모두 매칭.
      //   사용자가 cluster 클릭 → cluster 안 매물 ID 들이 clusterFilterIds 로 set →
      //   해당 cluster 만 selected (다른 cluster 는 normal).
      const filterIdSet = clusterFilterIds && clusterFilterIds.length > 0
        ? new Set(clusterFilterIds)
        : null;

      for (const arr of clusters.values()) {
        if (arr.length === 0) continue;
        let latSum = 0, lngSum = 0;
        for (const l of arr) { latSum += l.lat; lngSum += l.lng; }
        const lat = latSum / arr.length;
        const lng = lngSum / arr.length;
        const count = arr.length;
        // selected: ① selected 매물 포함 또는 ② cluster 안 매물 == filterIdSet (클릭 cluster).
        const hasSelected = selectedListingId != null && arr.some((l) => l.id === selectedListingId);
        const isClusterFiltered = filterIdSet != null
          && arr.length === filterIdSet.size
          && arr.every((l) => filterIdSet.has(l.id));
        const selected = hasSelected || isClusterFiltered;
        // L-naver-2026catcolor1: cluster 안 매물 다수 카테고리로 색 결정.
        //   investment 탭에서는 cluster 안 매물 majority category 사용 (cross-cutting).
        //   다른 탭에서는 그 category 그대로.
        let clusterCat: 'residence' | 'retail_office' | 'land' | 'investment' = 'residence';
        if (category === 'investment') {
          const counts: Record<string, number> = {};
          for (const l of arr) {
            const c = listingCategory(l.type);
            counts[c] = (counts[c] ?? 0) + 1;
          }
          let max = 0;
          for (const k of Object.keys(counts)) {
            if (counts[k] > max) { max = counts[k]; clusterCat = k as typeof clusterCat; }
          }
        } else {
          clusterCat = category;
        }
        // L-mapmarker2c: 개별/클러스터 모두 카운트 원으로 통일.
        //   사용자 피드백 (네이버 벤치마크): 가격 노출은 경쟁·직거래 리스크.
        //   주소 정확한 위치 표기 금지 — 카운트만 보여주고 최대확대에서도 건물 단위 묶음.
        // L-naver-zoomscale1 (2026-05-02): 줌 단계까지 고려한 사이즈.
        const isMobileViewport2 = typeof window !== 'undefined' && window.innerWidth < 768;
        const size = markerSize({ count, level, isMobile: isMobileViewport2 });
        const el = makeCircleElement({ count, selected, size, category: clusterCat });
        const clickHandler = (e: Event) => {
          e.stopPropagation();
          if (count === 1) {
            onClickListing(arr[0].id);
            return;
          }
          // L-naver-2026clusterfilter1 (2026-04-27): cluster 클릭 = 사이드바 필터 (사용자 요청).
          //   사용자 명시 요구: "마커 누르면 누른 마커에 해당하는 매물이 좌측 사이드바에 보여줘".
          //   동작:
          //     ① onClusterFilter(ids) → store.clusterFilterIds set → ListPanel 필터링
          //     ② cluster 안 매물 spread 만큼 살짝 zoom in (풀어보기 효과)
          //     ③ selected 시각 표시 (위 isClusterFiltered 분기에서 처리)
          //     ④ 다시 같은 cluster 클릭 또는 ActiveFilterPills X → setClusterFilter(null)
          const ids = arr.map((l) => l.id);
          const labelDong = arr.find((l) => l.dong)?.dong ?? null;
          const label = labelDong ? `${labelDong} ${count}개` : `${count}개 매물`;
          // toggle 동작: 이미 같은 cluster 가 selected 면 해제
          if (filterIdSet && filterIdSet.size === ids.length && ids.every((id) => filterIdSet.has(id))) {
            if (onClusterFilter) onClusterFilter(null, null);
            return;
          }
          if (onClusterFilter) onClusterFilter(ids, label);
          // L-naver-2026clusterprecise1 (2026-04-27): cluster 클릭 위치 정밀도 fix.
          //   사용자 피드백 "동그라미 마커 클릭 시 그 마커 기준에 맞춰 정확히 이동 안 됨".
          //   원인 (clusterclick1/3):
          //     · setCenter(lat, lng) + setLevel(nextLv, {animate:true}) 동시 호출 →
          //       Kakao SDK 가 두 액션을 독립 처리.  setLevel 의 animate 가 진행되며
          //       카메라가 이동하는 사이 setCenter 의 즉시 jump 가 일어나 미묘한 race.
          //     · cluster 안 매물 spread 가 cell 보다 작거나 큰 경우 cell centroid ≠
          //       매물의 진짜 visual center → 클릭 후 마커 위치가 화면 정중앙 아님.
          //   해결:
          //     ① setLevel({animate:false}) 로 zoom 부터 atomic 변경 → race 제거.
          //     ② setLevel 후 setCenter — 다음 frame 에 panTo 로 부드럽게.
          //     ③ cluster 안 매물의 진짜 bbox center (min/max 평균) 사용.
          //        cell centroid (단순 평균) 는 매물 분포 편향에 약함.
          try {
            const kakaoAny = (window as unknown as {
              kakao?: { maps?: {
                LatLng?: new (lat: number, lng: number) => unknown;
                LatLngBounds?: new (sw?: unknown, ne?: unknown) => unknown;
              } };
            }).kakao;
            const mapApi2 = mapInst as {
              setLevel?: (n: number, opts?: unknown) => void;
              getLevel?: () => number;
              panTo?: (pos: unknown) => void;
              setCenter?: (pos: unknown) => void;
            };
            const curLv = typeof mapApi2.getLevel === 'function' ? mapApi2.getLevel() : 4;
            // ③ 매물 진짜 bbox center (visual center) — cell centroid 보다 정확.
            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
            for (const l of arr) {
              if (l.lat < minLat) minLat = l.lat;
              if (l.lat > maxLat) maxLat = l.lat;
              if (l.lng < minLng) minLng = l.lng;
              if (l.lng > maxLng) maxLng = l.lng;
            }
            const targetLat = (minLat + maxLat) / 2;
            const targetLng = (minLng + maxLng) / 2;
            // L-naver-2026clusterclick3 (2026-04-26): zoom 동적 (count 큰 cluster -2, tight cluster -2).
            const latSpread = maxLat - minLat;
            const lngSpread = maxLng - minLng;
            const tightCluster = latSpread < 0.0008 && lngSpread < 0.0008;  // ~88m
            const dec = (count >= 20 || tightCluster) ? 2 : 1;
            const nextLv = Math.max(1, curLv - dec);
            // L-naver-2026flyto1 (2026-04-27): 자체 RAF cinematic flyTo (위치+줌 동시 부드럽게).
            const mapApi4 = mapInst as {
              getCenter?: () => { getLat: () => number; getLng: () => number };
              getLevel?: () => number;
              setCenter?: (latlng: unknown) => void;
              setLevel?: (n: number, opts?: unknown) => void;
            };
            if (kakaoAny?.maps?.LatLng
                && typeof mapApi4.getCenter === 'function'
                && typeof mapApi4.setCenter === 'function'
                && typeof mapApi4.setLevel === 'function'
                && typeof mapApi4.getLevel === 'function') {
              try {
                kakaoFlyTo(
                  mapApi4 as Parameters<typeof kakaoFlyTo>[0],
                  kakaoAny.maps.LatLng,
                  targetLat, targetLng, nextLv,
                );
              } catch {
                mapApi4.setCenter?.(new kakaoAny.maps.LatLng(targetLat, targetLng));
                mapApi4.setLevel?.(nextLv, { animate: false });
              }
            } else if (typeof mapApi2.setLevel === 'function') {
              mapApi2.setLevel(nextLv, { animate: false });
            }
          } catch { /* noop */ }
          return;
        };
        // L-clusterexact1: Kakao 지도 기본 더블클릭 확대 차단 (마커 영역에서만)
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
        el.addEventListener('click', clickHandler);
        try {
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(lat, lng),
            content: el,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 10,
            clickable: true,
          });
          ov.setMap(map);
          overlaysRef.current.push(ov);
        } catch { /* SDK race — skip */ }
      }
    };

    render();

    // 줌 변경 시 재렌더 — 그리드 셀 크기 & pill 사용 여부가 달라짐.
    const onZoom = () => { render(); };
    try { maps.event.addListener(mapInst as unknown, 'zoom_changed', onZoom); } catch { /* noop */ }

    return () => {
      try {
        if (maps.event.removeListener) {
          maps.event.removeListener(mapInst as unknown, 'zoom_changed', onZoom);
        }
      } catch { /* noop */ }
      cleanupOverlays();
    };
  }, [map, listings, selectedListingId, category, onClickListing, onClickComplex, onClickCluster, serverClusters, onClusterFilter, clusterFilterIds, clusterFilterListings]);

  return null;
}
