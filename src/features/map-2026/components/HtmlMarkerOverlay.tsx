// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HtmlMarkerOverlay — L-mapmarker3 (2026-04-24 pm)
// 행정구역 계층 클러스터링.  네이버·직방·다방 벤치마크.
//
// 이전(L-mapmarker2) grid 방식은 Math.floor(lat/gridSize) 로 좌표를 격자에
// 넣어 팬/줌 시 마커가 덜덜 떨리는 문제 + "어디에 뭐가 있는지" 를 읽을 수
// 없는 문제가 있었음.  행정구역 기반은:
//   · 줌아웃 (시/도): "서울 4,127" / "경기 1,832"
//   · 중간 (시/군/구): "강남구 1,234" / "서초구 876"
//   · 줌인 (동): "역삼동 45" / "삼성동 32"
//   · 근거리 (개별): 단지 pill(기존) + 원 마커
//
// 파싱은 adminRegion.ts 의 parseKoreanAddress 를 사용.
// listing.address 가 없으면 dong 에서 폴백, 그것도 없으면 grid 로 fallback.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { MapListing, PropertyCategory } from '@/features/map-2026/store';
import { bucketListings, listingCategory } from '@/features/map-2026/lib/markerTier';
import { parseKoreanAddress, adminLevelForZoom, type AdminLevel } from '@/features/map-2026/lib/adminRegion';

// ── 컬러 토큰 ──────────────────────────────────────────────────────
// 스타벅스 시그너처 그린 (#006241). 원 마커용.
const BRAND_GREEN = '#006241';
const BRAND_GREEN_BG = 'rgba(0,98,65,0.88)';
// 행정구역 레이블 칩 — 네이버 스타일 (흰 배경 + 짙은 글자 + 초록 카운트)
const REGION_BG = '#ffffff';
const REGION_FG = '#1a1a1a';
const REGION_BD = BRAND_GREEN;
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
interface KakaoMapsNs {
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  event: KakaoEventNs;
}
interface KakaoNamespace {
  maps?: KakaoMapsNs;
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
}

/** 행정구역 레이블 칩 — 시/도, 구, 동 레벨에서 사용.
 *  네이버 스타일: 흰 배경 + 지역명 + 숫자 배지. */
function makeRegionChip(opts: {
  label: string;
  count: number;
  selected: boolean;
}): HTMLDivElement {
  const { label, count, selected } = opts;
  const bg = selected ? SEL_BG : REGION_BG;
  const bd = selected ? SEL_BD : REGION_BD;
  const fg = selected ? '#fff' : REGION_FG;
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    `background:${bg}`,
    'border-radius:999px',
    'padding:6px 5px 6px 12px',
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

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  el.appendChild(labelEl);

  const badge = document.createElement('span');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `background:${selected ? 'rgba(255,255,255,0.22)' : BRAND_GREEN_BG}`,
    'color:#fff',
    'border-radius:999px',
    'padding:2px 8px',
    'font-size:11px',
    'font-weight:700',
    'margin-left:8px',
    'min-width:22px',
    'tabular-nums:1',
  ].join(';');
  // 1000+ 일 때 "1.2k" 로 축약
  badge.textContent = count >= 10000
    ? `${Math.floor(count / 1000)}k`
    : count >= 1000
      ? `${(Math.floor(count / 100) / 10).toFixed(1)}k`
      : String(count);
  el.appendChild(badge);

  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.06)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

/** 개별 매물 원 마커 — 근거리 (level ≤ 3) 에서 개수 없이 점 표시. */
function makeIndividualMarker(opts: {
  selected: boolean;
}): HTMLDivElement {
  const { selected } = opts;
  const bg = selected ? SEL_BG : BRAND_GREEN_BG;
  const bd = selected ? SEL_BD : BRAND_GREEN;
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-block',
    'width:14px',
    'height:14px',
    'border-radius:50%',
    `background:${bg}`,
    `border:2px solid ${bd}`,
    `box-shadow:${selected ? SEL_SHADOW : DEFAULT_SHADOW}`,
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'pointer-events:auto',
  ].join(';');
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.3)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

/** 단지 pill — 같은 building_name 에 ≥2개 있을 때 한 번에 표시 (기존 L-mapmarker2 재활용). */
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

/** 매물 한 건의 행정구역 키 추출.
 *  주소 파싱 실패 시 fallback key 를 반환해 표시는 되게 한다. */
function regionKeyFor(listing: MapListing, level: AdminLevel): string | null {
  const parsed = parseKoreanAddress(listing.address ?? listing.title ?? null);
  if (level === 'sido') return parsed.sido;
  if (level === 'gu') return parsed.gu;
  if (level === 'dong') return parsed.dong ?? listing.dong;
  return null;
}

export default function HtmlMarkerOverlay({
  map,
  listings,
  selectedListingId,
  category,
  onClickListing,
  onClickComplex,
  onClickCluster,
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
      const adminLevel = adminLevelForZoom(level);

      // 카테고리 필터 — 'investment' 는 cross-cutting 이므로 필터 해제.
      const filtered = category === 'investment'
        ? listings
        : listings.filter((l) => listingCategory(l.type) === category);
      if (filtered.length === 0) return;

      // ── 개별 뷰 (근거리) ──
      //   단지 pill 그룹핑 유지하되 나머지는 개별 원 마커.
      if (adminLevel === 'individual') {
        const buckets = bucketListings(filtered);
        const tier1Groups = buckets.tier1Groups;
        const rest = buckets.tier2Listings;

        for (const g of tier1Groups) {
          const selected =
            selectedListingId != null && g.listings.some((l) => l.id === selectedListingId);
          const el = makePillElement({ name: g.name, count: g.count, selected });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onClickComplex) onClickComplex(g.name, g.listings);
            else if (g.listings.length > 0) onClickListing(g.listings[0].id);
          });
          try {
            const ov = new maps.CustomOverlay({
              position: new maps.LatLng(g.lat, g.lng),
              content: el,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 11,
              clickable: true,
            });
            ov.setMap(map);
            overlaysRef.current.push(ov);
          } catch { /* SDK race — skip */ }
        }

        for (const l of rest) {
          const selected = selectedListingId === l.id;
          const el = makeIndividualMarker({ selected });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onClickListing(l.id);
          });
          try {
            const ov = new maps.CustomOverlay({
              position: new maps.LatLng(l.lat, l.lng),
              content: el,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 10,
              clickable: true,
            });
            ov.setMap(map);
            overlaysRef.current.push(ov);
          } catch { /* noop */ }
        }
        return;
      }

      // ── 행정구역 클러스터링 (sido / gu / dong) ──
      const groups = new Map<string, { listings: MapListing[]; latSum: number; lngSum: number; label: string }>();
      const unparsed: MapListing[] = [];
      for (const l of filtered) {
        const key = regionKeyFor(l, adminLevel);
        if (!key) { unparsed.push(l); continue; }
        const g = groups.get(key);
        if (g) {
          g.listings.push(l);
          g.latSum += l.lat;
          g.lngSum += l.lng;
        } else {
          groups.set(key, { listings: [l], latSum: l.lat, lngSum: l.lng, label: key });
        }
      }

      for (const g of groups.values()) {
        const count = g.listings.length;
        const lat = g.latSum / count;
        const lng = g.lngSum / count;
        const selected =
          selectedListingId != null && g.listings.some((l) => l.id === selectedListingId);
        const el = makeRegionChip({ label: g.label, count, selected });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (count === 1) onClickListing(g.listings[0].id);
          else if (onClickCluster) onClickCluster(g.listings);
          else onClickListing(g.listings[0].id);
        });
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

      // ── 주소 파싱 실패 매물 — 좌표 근접 그리드로 폴백 (유실 방지) ──
      if (unparsed.length > 0) {
        const gridSize = adminLevel === 'sido' ? 0.25 : adminLevel === 'gu' ? 0.08 : 0.02;
        const fbGroups = new Map<string, MapListing[]>();
        for (const l of unparsed) {
          const cx = Math.floor(l.lat / gridSize);
          const cy = Math.floor(l.lng / gridSize);
          const k = `fb:${cx}:${cy}`;
          const arr = fbGroups.get(k);
          if (arr) arr.push(l);
          else fbGroups.set(k, [l]);
        }
        for (const arr of fbGroups.values()) {
          let latSum = 0;
          let lngSum = 0;
          for (const l of arr) { latSum += l.lat; lngSum += l.lng; }
          const lat = latSum / arr.length;
          const lng = lngSum / arr.length;
          const count = arr.length;
          const selected =
            selectedListingId != null && arr.some((l) => l.id === selectedListingId);
          const el = makeRegionChip({ label: '기타', count, selected });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (count === 1) onClickListing(arr[0].id);
            else if (onClickCluster) onClickCluster(arr);
            else onClickListing(arr[0].id);
          });
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
          } catch { /* noop */ }
        }
      }
    };

    render();

    // 줌 변경 시 재렌더 — 행정구역 레벨이 달라짐.
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
  }, [map, listings, selectedListingId, category, onClickListing, onClickComplex, onClickCluster]);

  return null;
}
