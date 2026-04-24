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

// ── 컬러 토큰 ──────────────────────────────────────────────────────
// 스타벅스 시그너처 그린 (#006241). alpha 0.88 채움 + 동일 hex 테두리.
const BRAND_GREEN = '#006241';
const BRAND_GREEN_BG = 'rgba(0,98,65,0.88)';
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
  if (level <= 1) return 0.0005;    // ~55m (단일 건물 단위)
  if (level <= 2) return 0.0012;    // ~130m (블록 단위)
  if (level <= 3) return 0.0020;    // ~220m
  if (level <= 4) return 0.0036;    // ~400m
  if (level <= 5) return 0.006;     // ~600m (기본 줌)
  if (level <= 6) return 0.010;     // ~1.1km (이전 1.3km → 약간 더 촘촘)
  if (level <= 7) return 0.016;     // ~1.8km (이전 2km)
  if (level <= 8) return 0.024;     // ~2.7km (이전 3.5km)
  if (level <= 9) return 0.035;     // ~3.9km (이전 5.5km)
  if (level <= 10) return 0.045;    // ~5km (이전 9km — 핵심 개선, 수도권 분리)
  if (level <= 11) return 0.060;    // ~6.7km (광역시 구분)
  if (level <= 12) return 0.090;    // ~10km
  return 0.120;                     // ~13km (level 13+ 전국 뷰)
}

/** 카운트 표시 원 — 단일 매물이면 '1', 클러스터면 N. */
function makeCircleElement(opts: {
  count: number;
  selected: boolean;
  size: number;
}): HTMLDivElement {
  const { count, selected, size } = opts;
  const bg = selected ? SEL_BG : BRAND_GREEN_BG;
  const bd = selected ? SEL_BD : BRAND_GREEN;
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:50%',
    `background:${bg}`,
    'color:#fff',
    `border:1.5px solid ${bd}`,
    `box-shadow:${selected ? SEL_SHADOW : DEFAULT_SHADOW}`,
    `font-size:${count >= 100 ? '11px' : count >= 10 ? '12px' : '13px'}`,
    'font-weight:700',
    'letter-spacing:-0.3px',
    'cursor:pointer',
    'user-select:none',
    'transition:transform 150ms ease',
    'font-family:inherit',
    'pointer-events:auto',
  ].join(';');
  el.textContent = count >= 1000 ? `${Math.floor(count / 100) / 10}k` : String(count);
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.08)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
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

      // L-adminpoly1 (2026-04-24 pm): 축소 뷰(level ≥ 10) 에서는 AdminRegionOverlay
      //   가 시/도 폴리곤 + 카운트 chip 으로 대체 표시.  grid 카운트 원은 숨김 →
      //   시각 중복 제거.
      if (level >= 10) return;

      // ━━ L-worldclass1 (2026-04-24 pm): 서버 사전집계 클러스터 우선 경로 ━━
      //   serverClusters 가 제공되면 클라이언트 grid 클러스터링을 완전히 건너뛰고
      //   바로 카운트 원을 렌더한다.  listings[] 는 ListPanel 용으로만 쓰이고
      //   지도 마커는 /api/map/clusters 의 pre-aggregated 결과로만 그림.
      if (Array.isArray(serverClusters) && serverClusters.length > 0) {
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
          const size = count >= 100 ? 46 : count >= 10 ? 42 : count >= 2 ? 40 : 36;
          const el = makeCircleElement({ count, selected, size });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSingle && singleId != null) {
              onClickListing(singleId);
            } else if (onClickCluster && single) {
              onClickCluster([single]);
            } else if (singleId != null) {
              onClickListing(singleId);
            }
            // cluster(count≥2) 에서 sample_ids 가 없는 경우는 현재 bbox 를 좁혀가는
            // UX 로 이어져야 하지만 우선 기본 동작 (아무것도 안 함).  후속 개선 여지.
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
      const filtered = category === 'investment'
        ? listings
        : listings.filter((l) => listingCategory(l.type) === category);
      if (filtered.length === 0) return;

      // 근거리 (level ≤ 4) 에서만 단지 pill 사용 — 멀리서는 grid cluster 가 삼킨다.
      const usePill = level <= 4;
      let tier1Groups: ReturnType<typeof bucketListings>['tier1Groups'] = [];
      let rest: MapListing[] = filtered;
      if (usePill) {
        const buckets = bucketListings(filtered);
        tier1Groups = buckets.tier1Groups;
        rest = buckets.tier2Listings;
      }

      // ── Tier 1 단지 pill ──
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

      // ── Grid clustering ──
      const gridSize = gridSizeForLevel(level);
      const clusters = new Map<string, MapListing[]>();
      if (gridSize === 0) {
        // 개별 매물 — 클러스터링 해제
        for (const l of rest) {
          clusters.set(`i:${l.id}`, [l]);
        }
      } else {
        for (const l of rest) {
          const cx = Math.floor(l.lat / gridSize);
          const cy = Math.floor(l.lng / gridSize);
          const k = `${cx}:${cy}`;
          const arr = clusters.get(k);
          if (arr) arr.push(l);
          else clusters.set(k, [l]);
        }
      }

      for (const arr of clusters.values()) {
        if (arr.length === 0) continue;
        let latSum = 0;
        let lngSum = 0;
        for (const l of arr) { latSum += l.lat; lngSum += l.lng; }
        const lat = latSum / arr.length;
        const lng = lngSum / arr.length;
        const count = arr.length;
        const selected =
          selectedListingId != null && arr.some((l) => l.id === selectedListingId);
        // L-mapmarker2c: 개별/클러스터 모두 카운트 원으로 통일.
        //   사용자 피드백 (네이버 벤치마크): 가격 노출은 경쟁·직거래 리스크.
        //   주소 정확한 위치 표기 금지 — 카운트만 보여주고 최대확대에서도 건물 단위 묶음.
        const size = count >= 100 ? 46 : count >= 10 ? 42 : count >= 2 ? 40 : 36;
        const el = makeCircleElement({ count, selected, size });
        const clickHandler = (e: Event) => {
          e.stopPropagation();
          if (count === 1) onClickListing(arr[0].id);
          else if (onClickCluster) onClickCluster(arr);
          else onClickListing(arr[0].id);
        };
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
  }, [map, listings, selectedListingId, category, onClickListing, onClickComplex, onClickCluster, serverClusters]);

  return null;
}
