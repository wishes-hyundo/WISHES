// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClient — Kakao SDK 베이스 + deck.gl 오버레이 (L-kakao1 2026-04-22)
//
// 배경: 이전 MapLibre + OpenFreeMap 스택이 한국 POI(지하철/건물/동경계)·
//   한국어 라벨을 제공하지 못해 사용자 경험이 크게 저하되어 Kakao SDK 로
//   되돌림. 10만+ 매물 성능은 기존 KakaoDeckOverlay.tsx 의 GPU 오버레이로
//   유지.
//
// 보존: SmartChips·ActiveFilterPills·ListPanel·NlSearchBar·MiniCard·
//   SemanticZoomIndicator·MapControls (3D/등시선 버튼은 silently no-op)
//   ·Hero Score·저렴/비쌈 뱃지·800개 viewport RPC.
//
// 제거: MapLibre 3D 건물, isochrone MapLibre 오버레이, HeroPinLayer 의 DOM 핀.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

// L-urgent1 (2026-04-22): ESLint no-html-link-for-pages — <a> → <Link> 전환.
import Link from 'next/link';

import { useEffect, useRef, useState, useCallback } from 'react';

// Wave 66: PropertyCategory, MapListing type imports 제거 — KakaoDeckOverlay JSX/useMemo 제거 후 unused.
import { useMap2026Store } from '@/features/map-2026/store';
import { useViewport } from '@/features/map-2026/hooks/useViewport';
import { useSemanticZoom } from '@/features/map-2026/hooks/useSemanticZoom';
import { useHeroRanking } from '@/features/map-2026/hooks/useHeroRanking';
import { useFilterUrlSync } from '@/features/map-2026/hooks/useFilterUrlSync';
// L-listingurl1 (2026-04-29 사장님 명령): 매물 클릭 시 /map?listing=ID URL 동기화.
//   새로고침/공유링크에서도 해당 매물 카드 자동 오픈.
import { useListingUrlSync } from '@/features/map-2026/hooks/useListingUrlSync';

import { NlSearchBar } from '@/features/map-2026/components/NlSearchBar';
// L-mapfilter4 (2026-04-23): SmartChips 래퍼 해체.
//   Row 2 = CategoryTabs 직접 배치, FilterModal 은 루트에 별도 마운트.
import { CategoryTabs } from '@/features/map-2026/components/CategoryTabs';
import { FilterModal } from '@/features/map-2026/components/FilterModal';
// L-mapmodal1 (2026-04-23): 핀/카드 클릭 시 열리는 매물 상세 요약 모달.
import { ListingDetailModal } from '@/features/map-2026/components/ListingDetailModal';
import { ActiveFilterPills } from '@/features/map-2026/components/ActiveFilterPills';
// L-mapfilter4: Row 1 우측 CTA — 로그인/매물내놓기.
//   /map 페이지는 ConditionalLayout 에서 전역 Header 를 숨기므로 계정 동선이
//   없었다. AuthProvider 는 /map 에도 래핑되어 있어 useAuth 재활용 가능.
import { useAuth } from '@/contexts/AuthContext';
import { LogIn } from 'lucide-react';
import { ListPanel } from '@/features/map-2026/components/ListPanel';
import { MapControls } from '@/features/map-2026/components/MapControls';
import { SemanticZoomIndicator } from '@/features/map-2026/components/SemanticZoomIndicator';
import { MiniCard } from '@/features/map-2026/components/MiniCard';
import { SumBox } from '@/features/map-2026/components/SumBox';
import { CopyToastOutlet } from '@/features/map-2026/components/CopyToast';
// L-mapfilter3 (2026-04-23): FilterAccordion 은 FilterModal 안에서 렌더된다.
//   사이드바에서 항상 노출되던 기존 배치는 "사용하기 너무 불편" 피드백으로
//   Gate 패턴 (카테고리 탭 클릭 → 모달) 으로 전환됨.

// Wave 66 (사장님 명령 2026-05-04): KakaoDeckOverlay 영구 제거 (R-D1).
//   import + JSX + 관련 useMemo (items / webglClusters / webglItems / onClickWebglCluster) 모두 제거.
// Wave 38 (2026-05-04 사장님 명령 끝까지 마무리): 직방/네모 패턴 SVG single-layer marker.
//   Kakao CustomOverlay 415개 setMap = 146ms freeze 한계. SVG 1 layer 안 모든 cluster = 1 reflow.
//   URL ?svg=1 시 활성 (사장님 검증). 다음 Wave 39 에서 기본 활성 + HtmlMarkerOverlay 비활성.
import SvgMarkerLayer from '@/components/map/SvgMarkerLayer';
// Wave 49 (2026-05-04 사장님 명령 "끝까지 무조건"): Canvas 2D marker layer.
//   SVG 50ms 한계 도달 (SVG DOM reflow 자체). Canvas 2D = 53 cluster 5ms 예상.
//   ?canvas=1 활성 (검증), Wave 50 에서 default.
import CanvasMarkerLayer from '@/components/map/CanvasMarkerLayer';
// Wave 66 (2026-05-04): clusterAggregation + listingCategoryOf imports 제거.
//   webglClusters / webglItems useMemo 가 사용했던 함수들. KakaoDeckOverlay 제거 후 unused.
// L-mapmarker1 (2026-04-23): 네이버·직방 스타일 HTML 마커 (Kakao CustomOverlay).
//   KakaoDeckOverlay 의 item scatter 는 items=[] 로 비활성화 (cluster 레이어는 유지).
// Wave 66 (사장님 명령 2026-05-04): HtmlMarkerOverlay 영구 제거 — Wave 45 미완 마무리.
//   2-layer 중첩 (SvgMarkerLayer + HtmlMarkerOverlay) 가 마커 stuck 의 근본 원인 R-A2.
//   import 자체 제거 = mount 가능성 0.
// import HtmlMarkerOverlay from '@/features/map-2026/components/HtmlMarkerOverlay';
import AdminRegionOverlay from '@/features/map-2026/components/AdminRegionOverlay';
// L-naver-2026minimal1 (2026-04-27): IsochroneOverlay / PoiOverlay 제거 (사용자 요청).
import MobileListSheet from '@/features/map-2026/components/MobileListSheet';
import { MapErrorBoundary } from '@/features/map-2026/components/MapErrorBoundary';
import MapLoadingIndicator from '@/features/map-2026/components/MapLoadingIndicator';
// L-worldclass1 (2026-04-24 pm): 서버 사전집계 클러스터 훅
// Wave 69 (사장님 명령 2026-05-06 재설계 / I-ARCH-1): useMapClusters 부활.
//   /api/map/clusters server cluster API (33KB / 697ms 측정) → SvgMarkerLayer 직접 사용.
//   기존 client aggregateClusters 우회 (worker thread 도 부담 X).
//   payload 1.28MB → ~33KB (39배 감소).
import { useMapClusters } from '@/features/map-2026/hooks/useMapClusters';

// 서울 기본 중심
const SEOUL = { lat: 37.4979, lng: 127.0276 };

// L-naver-zoom2 (2026-04-26 night): 정밀 검수 후 1단계 보정.
//   이전 21-level 은 z13 = level 8 (sigungu) 이었으나 Naver z13 = dong 이어야 함.
//   20-level 로 변경: level 7 = z13 (dong), level 4 = z16 (markers).
function levelToZoom(level: number): number {
  return Math.max(0, 20 - level);
}

// Kakao SDK 동적 로더 — autoload=false 로 SSR 안전, 다중 호출 중복 방지
function loadKakaoSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    const w = window as unknown as {
      kakao?: { maps?: { load: (cb: () => void) => void; LatLng: unknown; Map: unknown } };
    };
    if (w.kakao?.maps?.Map) {
      // 이미 로드 완료
      resolve();
      return;
    }
    const existing = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;
    const onScriptReady = () => {
      if (w.kakao?.maps?.load) {
        w.kakao.maps.load(() => resolve());
      } else {
        reject(new Error('kakao.maps.load unavailable'));
      }
    };
    if (existing) {
      if (w.kakao?.maps) onScriptReady();
      else existing.addEventListener('load', onScriptReady, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.onload = onScriptReady;
    script.onerror = () => reject(new Error('Kakao SDK network error'));
    document.head.appendChild(script);
  });
}

export default function MapClient() {
  // M-6 (사장님 명령 2026-05-02): 비로그인 줌 락 — privacy 보호 + 수익화.
  //   직방/네이버처럼 raw 정확 좌표 사용하지만 비로그인은 너무 가까이 줌인 X.
  //   setMinLevel(4) = z16 까지만 (Kakao level 작을수록 가까이).
  const { user: _userM6 } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<unknown>(null);
  // L-map2 (2026-04-22): KakaoDeckOverlay 가 mount 되지 않던 경쟁조건 해결.
  //   useRef 값 변경은 리렌더를 유발하지 않아 {ready && kakaoMapRef.current}
  //   조건이 false 로 고정되는 경우가 있었다. state 로 미러링해서 마운트 보장.
  const [kakaoMap, setKakaoMap] = useState<unknown>(null);
  // L-worldclass1: Kakao level 추적 → useMapClusters 에 전달
  const [kakaoLevel, setKakaoLevel] = useState<number>(5);
  // Wave 69 (사장님 명령 2026-05-06 재설계): server cluster fetch (debounce 250ms 내장)
  const { clusters: serverClusters } = useMapClusters(kakaoLevel);
  // Wave 44 (2026-05-04): SVG 기본 활성 (Wave 38~43 검증 완료, 사장님 명령 옵션 A).
  //   prod 측정: zoom freeze 95ms → 0ms (warm worker), pan freeze 0ms 유지.
  //   ?svg=0 = 비상 롤백 (HtmlMarkerOverlay 옛날 모드 복원).
  //   I-PERF-2 영구 INVARIANT 로 보존.
  const [useSvg, setUseSvg] = useState(true);
  // Wave 49 (2026-05-04): Canvas 2D layer 검증 토글 (?canvas=1).
  //   true 시 SvgMarkerLayer 비활성 + CanvasMarkerLayer 활성. SVG 코드 비상 롤백용 보존.
  const [useCanvas, setUseCanvas] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<string>('');

  // Wave 44: URL query opt-out (?svg=0 시 옛날 HtmlMarkerOverlay 모드).
  // Wave 49: ?canvas=1 시 Canvas 2D layer 활성 (검증 모드).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('svg') === '0') setUseSvg(false);
      if (params.get('canvas') === '1') setUseCanvas(true);
    } catch { /* noop */ }
  }, []);

  // Wave 59 (사장님 명령 2026-05-04): polling 기반 polygon 강제 제거.
  //   Wave 54~58 모두 실패 (Kakao SDK setMap(null) DOM 안 지움 + useEffect [kakaoLevel] 발화 안 함).
  //   진단 (prod 직접 setInterval 실험): polling 으로 polygon 제거 시 100% 작동 확인.
  //   해결: setInterval 200ms, kakaoLevel <= 6 시 path[id^=daum-maps-shape-] 모두 remove.
  //   I-POLY-1 절대 보장.
  const kakaoLevelRef = useRef(kakaoLevel);
  kakaoLevelRef.current = kakaoLevel;
  useEffect(() => {
    const interval = setInterval(() => {
      if (kakaoLevelRef.current <= 6) {
        try {
          document.querySelectorAll('path[id^="daum-maps-shape-"]').forEach((el) => el.remove());
        } catch { /* noop */ }
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Wave 64 (사장님 명령 2026-05-04): 로그인 상태 변경 시 setMinLevel 동적 재적용.
  //   useAuth() 는 비동기 — map init 시점엔 _userM6 가 null 이라 setMinLevel(4) 적용 후
  //   로그인 완료해도 cap 그대로 z16 에 머물러 사장님이 "줌 단계 더 늘려달라" 요청.
  //   이 effect 가 user 변경 감지해서 setMinLevel(1) 으로 재호출 → z19 까지 줌인 가능.
  useEffect(() => {
    if (!kakaoMap) return;
    try {
      const m = kakaoMap as { setMinLevel?: (n: number) => void };
      if (typeof m.setMinLevel === 'function') {
        m.setMinLevel(_userM6 ? 1 : 4);
      }
    } catch { /* noop */ }
  }, [_userM6, kakaoMap]);

  // Wave 58 (사장님 명령 2026-05-04): I-POLY-1 강제 root-level fix.
  //   Wave 54~57 모두 실패 (Kakao SDK setMap(null) polygon DOM 안 지움).
  //   해결: MapClient root 에 useEffect, kakaoLevel <= 6 (z14+) 시 직접 DOM remove.
  //   AdminRegionOverlay 만 daum-maps-shape-* 사용 → 안전.
  useEffect(() => {
    if (kakaoLevel > 6) return;
    const removeAll = () => {
      try {
        document.querySelectorAll('path[id^="daum-maps-shape-"]').forEach((el) => el.remove());
      } catch { /* noop */ }
    };
    removeAll();
    const t1 = setTimeout(removeAll, 50);
    const t2 = setTimeout(removeAll, 200);
    const t3 = setTimeout(removeAll, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [kakaoLevel]);

  const setMap = useMap2026Store((s) => s.setMap);
  const setBbox = useMap2026Store((s) => s.setBbox);
  const setZoom = useMap2026Store((s) => s.setZoom);
  const listings = useMap2026Store((s) => s.listings);
  // L-mapmodal1 (2026-04-23): onClickListing 은 selectListing 대신
  //   openListingDetail 을 사용해 지도 포커스 + 상세 모달 오픈을 한 번에 처리.
  const openListingDetail = useMap2026Store((s) => s.openListingDetail);
  // L-mapmarker1 (2026-04-23): HtmlMarkerOverlay 선택 상태 표시용
  const detailListingId = useMap2026Store((s) => s.detailListingId);
  // L-mapmarker2 (2026-04-23): 상단 카테고리 탭 → 마커 클라이언트 필터
  const filterCategory = useMap2026Store((s) => s.filter.category);
  const listPanelCollapsed = useMap2026Store((s) => s.listPanelCollapsed);
  const toggleListPanel = useMap2026Store((s) => s.toggleListPanel);
  const listingsCount = useMap2026Store((s) => s.listings.length);
  // L-clusterexact1 + L-clusterexact3 (2026-04-24 pm): 클러스터 필터 state + setter
  const clusterFilterIds = useMap2026Store((s) => s.clusterFilterIds);
  const clusterFilterListings = useMap2026Store((s) => s.clusterFilterListings);
  const setClusterFilter = useMap2026Store((s) => s.setClusterFilter);

  // Kakao 지도 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    // L-mapfix-2026-05-02 (사장님 명령 — 지도 안 뜨는 증상):
    //   Vercel env NEXT_PUBLIC_KAKAO_MAP_KEY 미설정 시 layout.tsx 의 SDK 는
    //   fallback 키로 정상 로드되지만, MapClient 는 env 미설정 시 init 자체를
    //   포기해서 지도 영역이 회색으로 비워짐. layout 과 동일한 fallback 으로 통일.
    const FALLBACK_KAKAO_KEY = 'a1c65d0ec2ecc8d2d231f8558f896e38';
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
      && process.env.NEXT_PUBLIC_KAKAO_MAP_KEY !== '여기에_카카오_JavaScript_앱키_입력'
      ? process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
      : FALLBACK_KAKAO_KEY;
    const container = containerRef.current;
    let disposed = false;
    let idleListener: (() => void) | null = null;
    let mapInst: unknown = null;

    (async () => {
      try {
        await loadKakaoSdk(key);
        if (disposed) return;
        const kakao = (window as unknown as {
          kakao: {
            maps: {
              LatLng: new (lat: number, lng: number) => unknown;
              Map: new (
                el: HTMLElement,
                opts: {
                  center: unknown;
                  level: number;
                  disableDoubleClick?: boolean;
                  disableDoubleClickZoom?: boolean;
                  draggable?: boolean;
                  scrollwheel?: boolean;
                }
              ) => {
                getBounds: () => {
                  getSouthWest: () => { getLat: () => number; getLng: () => number };
                  getNorthEast: () => { getLat: () => number; getLng: () => number };
                };
                getLevel: () => number;
              };
              event: {
                addListener: (target: unknown, type: string, handler: (...args: any[]) => void) => void;
              };
            };
          };
        }).kakao;

        const map = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng),
          // L-naver-zoom9 (2026-04-26): 기본 zoom level 8 → 9 (네이버 z13 visual scale 정확 매칭).
          //   level 9 = sigungu only (광역뷰).  사용자 1회 줌인 시 multi-dong 시작.
          level: 9,
          // L-mobile-tap (2026-04-29 사장님 명령): "더블 탭하면 지도 확대" — 카카오 기본 더블탭 줌 활성.
          disableDoubleClickZoom: false,
        });
        mapInst = map;
        kakaoMapRef.current = map;
        setKakaoMap(map); // state 로도 반영 → 오버레이 조건부 마운트 트리거

        // Wave 64 (사장님 명령 2026-05-04): 로그인 시 줌 단계 더 깊이.
        //   비로그인 setMinLevel(4) = z16 까지 (privacy 보호 + 수익화).
        //   로그인 setMinLevel(1) = z19 (Kakao 표준 최대 줌) — 카카오 SDK 가
        //   level 1 미만은 floor 처리하므로 0/-1 시도해도 의미 X.
        //   ★ 실제 user 값이 비동기 로드되므로 init 시점 + user 변경 시 양쪽 다 호출.
        //     아래 별도 useEffect 가 user 변경 시 동적 재호출 담당.
        try {
          const m = map as { setMinLevel?: (n: number) => void; setMaxLevel?: (n: number) => void };
          if (typeof m.setMinLevel === 'function') {
            m.setMinLevel(_userM6 ? 1 : 4);
          }
          // Wave 64: 광역 뷰 cap = 14 (전국 보기 가능)
          if (typeof m.setMaxLevel === 'function') {
            m.setMaxLevel(14);
          }
        } catch { /* SDK race — skip */ }

        const sync = () => {
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          setBbox({
            west: sw.getLng(),
            south: sw.getLat(),
            east: ne.getLng(),
            north: ne.getLat(),
          });
          setZoom(levelToZoom(map.getLevel()));
          setKakaoLevel(map.getLevel());  // L-worldclass1: useMapClusters 에 전달
        };

        idleListener = sync;
        kakao.maps.event.addListener(map, 'idle', sync);
        sync(); // 초기 1회 강제 호출 → RPC 트리거

        // L-mobile-tap (2026-04-29 사장님 명령): 단일 탭 → 그 위치에 폴리곤(임시 영역) 표시.
        //   "한번 누르면 그 위치에 폴리곤이 떠야돼" — 폴리곤 안 보이는 광역 줌에서도 즉시 매물 검색.
        //   동작:
        //     · 현재 level >= 7 (광역) → 그 좌표 panTo + setLevel(5) — 동 단위 폴리곤 등장 레벨.
        //     · 현재 level <= 6 (이미 가까움) → 그 좌표 중심 250m radius Circle 임시 표시 (1.5초 후 자동 제거).
        //     · 더블탭은 카카오 기본 줌인이 자동 처리.
        let tapCircle: any = null;
        let tapCircleTimer: any = null;
        const onMapClick = (mouseEvent: any) => {
          try {
            // 모바일 + 태블릿에서만 작동 (데스크탑은 마우스 click 빈번해서 UX 방해)
            if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            const latlng = mouseEvent?.latLng;
            if (!latlng) return;
            const currentLevel = map.getLevel();
            // 햅틱 — Android 진동 피드백
            try { (navigator as any).vibrate?.(8); } catch {}
            if (currentLevel >= 7) {
              // 광역 → 동 단위 폴리곤 등장 레벨로 줌인 + panTo
              try { (map as any).setLevel?.(5, { anchor: latlng, animate: true }); } catch {
                try { (map as any).setLevel?.(5); } catch {}
              }
              try { (map as any).panTo?.(latlng); } catch {}
            } else {
              // 이미 가까운 줌 → 그 위치 임시 Circle 표시 (시각 신호)
              if (tapCircle) { try { tapCircle.setMap(null); } catch {} tapCircle = null; }
              if (tapCircleTimer) { clearTimeout(tapCircleTimer); tapCircleTimer = null; }
              try {
                tapCircle = new (kakao as any).maps.Circle({
                  center: latlng,
                  radius: 250,
                  strokeWeight: 2,
                  strokeColor: '#2D5A27',
                  strokeOpacity: 0.9,
                  strokeStyle: 'solid',
                  fillColor: '#3a7d44',
                  fillOpacity: 0.18,
                });
                tapCircle.setMap(map);
                try { (map as any).panTo?.(latlng); } catch {}
                tapCircleTimer = setTimeout(() => {
                  try { tapCircle?.setMap(null); } catch {}
                  tapCircle = null;
                }, 1800);
              } catch (e) {
                console.warn('[MapClient] tap Circle failed:', (e as Error)?.message);
              }
            }
          } catch (err) {
            console.warn('[MapClient] click handler failed:', (err as Error)?.message);
          }
        };
        kakao.maps.event.addListener(map, 'click', onMapClick);

        setMap(map as never);
        setReady(true);
      } catch (e) {
        console.warn('[MapClient] Kakao SDK init failed:', e);
        setFailReason((e as Error)?.message ?? String(e));
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      // Kakao 는 명시적 destroy API 가 없음 — container 비우고 ref 초기화
      kakaoMapRef.current = null;
      setKakaoMap(null);
      idleListener = null;
      // 재초기화를 위해 container innerHTML 클리어
      if (container) {
        try { container.innerHTML = ''; } catch { /* noop */ }
      }
      void mapInst;
    };
  }, [setMap, setBbox, setZoom]);

  // 뷰포트·semantic zoom·hero 랭킹 — store 기반이라 map 인스턴스와 무관
  useViewport();
  useSemanticZoom();
  useHeroRanking();

  // L-clusterexact3 (2026-04-24 pm) + fix2 (사용자 피드백 "구단위 넘어갈때까지
  //   해제가 안됨"): 사용자가 지도를 직접 조작하면 (wheel/drag/touch) clusterFilter
  //   자동 해제.  두 가지 핵심 수정:
  //     1) subscribeWithSelector 정식 형태 (selector, listener) 로 변경 —
  //        이전 `(state, prev)` 시그니처는 prev=undefined 로 TypeError 발생 →
  //        ignoreUntil 아예 세팅 안 됐음.
  //     2) container 대신 window 에 capture phase 로 리스너 등록 — Kakao 지도는
  //        내부 canvas 에서 wheel 을 stopPropagation 할 수 있어 container 레벨
  //        bubble 단계 리스너가 호출되지 않았음.  window + capture 로 이벤트를
  //        가장 먼저 받고 event.target 이 지도 container 안인지만 확인.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !kakaoMap) return;
    let ignoreUntil = 0;
    const onUserInput = (e: Event) => {
      if (!container.contains(e.target as Node)) return;
      if (Date.now() < ignoreUntil) return;
      const st = useMap2026Store.getState();
      if (st.clusterFilterIds && st.clusterFilterIds.length > 0) {
        st.setClusterFilter(null);
      }
    };
    // subscribeWithSelector: (selector, listener) 형태 필수
    const unsub = useMap2026Store.subscribe(
      (s) => s.clusterFilterIds,
      (ids) => {
        if (ids && ids.length > 0) {
          // setBounds 관성 애니메이션 흡수 창 (400ms)
          ignoreUntil = Date.now() + 400;
        }
      },
    );
    window.addEventListener('wheel', onUserInput, { passive: true, capture: true });
    window.addEventListener('mousedown', onUserInput, true);
    window.addEventListener('touchstart', onUserInput, { passive: true, capture: true });
    return () => {
      window.removeEventListener('wheel', onUserInput, true);
      window.removeEventListener('mousedown', onUserInput, true);
      window.removeEventListener('touchstart', onUserInput, true);
      unsub();
    };
  }, [kakaoMap]);

  // L-v7-url (2026-04-22): URL ↔ FilterState 양방향 동기화. 페이지 진입 시
  //   1회 수화 → 이후 filter/sort/nlQuery 변경 시 replaceState 반영. v7 §5.
  useFilterUrlSync();
  // L-listingurl1 (2026-04-29): URL ↔ detailListingId 동기화. 매물 클릭 시
  //   `?listing=ID` 즉시 반영. 새로고침/공유링크에서 자동 카드 오픈.
  useListingUrlSync();

  // Wave 66 (사장님 명령 2026-05-04): items / webglClusters / webglItems / onClickWebglCluster
  //   useMemo 4개 영구 제거 (R-D1 의 일부). KakaoDeckOverlay 가 제거됐으므로 모두 unused.
  //   효과: render 비용 감소 + listings 변경 시 main thread blocking 감소 (특히 cluster 집계).

  const onClickListing = useCallback(
    (id: number) => {
      // L-mapmodal1: 상세 모달 오픈 + 지도 flyTo (store 에서 한 번에 처리)
      openListingDetail(id);
    },
    [openListingDetail]
  );

  if (failed) {
    return (
      <div className="grid h-full place-items-center bg-wishes-cream/40 px-4">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-lg font-bold text-wishes-primary">지도를 불러올 수 없어요</h2>
          <p className="mb-4 text-sm text-gray-600">
            Kakao 지도 초기화에 실패했습니다. 잠시 후 다시 시도하거나 목록에서 매물을 확인해 보세요.
          </p>
          {failReason && (
            <p className="mb-3 text-[11px] text-gray-400">{failReason}</p>
          )}
          <Link
            href="/listings"
            className="inline-flex items-center justify-center rounded-xl bg-wishes-primary px-5 py-3 text-sm font-bold text-white hover:bg-wishes-secondary"
          >
            매물 목록 보기
          </Link>
        </div>
      </div>
    );
  }

  return (
    // 4-track grid — 헤더 / 카테고리탭 / ActiveFilterPills / 본문(1fr)
    // L-mapfilter4 (2026-04-23): 2줄 헤더 재설계.
    //   Row 1 = 로고 + 검색바 + 우측 CTA (매물내놓기/로그인·회원가입)
    //   Row 2 = 카테고리 탭 (아래 매물정보 영역 위에 얹힘)
    //   FilterModal 은 카테고리 탭 클릭 시 오픈 — 루트에 별도 마운트하여
    //   grid track 에 영향 주지 않음 (position: fixed).
    <div className="grid h-full grid-rows-[auto_auto_auto_minmax(0,1fr)]">
      <header
        className="flex items-center gap-1.5 sm:gap-3 border-b border-neutral-100 bg-white px-2 sm:px-4 py-2 min-w-0 overflow-hidden"
        style={{ paddingLeft: 'max(8px, env(safe-area-inset-left, 8px))', paddingRight: 'max(8px, env(safe-area-inset-right, 8px))' }}
      >
        <Brand />
        <NlSearchBar />
        <TopRightActions />
      </header>

      <CategoryTabs />
      <ActiveFilterPills />

      <div
        className={[
          // L-naver-2026bottomsheet1 (2026-04-27): 모바일은 ListPanel 시트로 옮김.
          //   md 미만: grid 1열 (지도 100%). ListPanel 은 MobileListSheet 가 별도 fixed.
          //   md+: 기존 grid (좌측 사이드바 + 지도).
          'grid h-full min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)]',
          'grid-cols-1',
          listPanelCollapsed
            ? 'md:grid-cols-[28px_minmax(0,1fr)]'
            : 'md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]',
        ].join(' ')}
      >
        {listPanelCollapsed ? (
          <button
            onClick={toggleListPanel}
            aria-label={`매물 리스트 펼치기 (${listingsCount}개)`}
            className="group hidden h-full flex-col items-center gap-2 border-r border-neutral-200 bg-white py-3 transition hover:bg-neutral-50 md:flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 group-hover:text-neutral-900"><path d="M9 18l6-6-6-6"/></svg>
            <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold tabular-nums text-neutral-700">
              {listingsCount}개 매물
            </span>
          </button>
        ) : (
          <div className="relative hidden min-h-0 flex-col md:flex">
            {/* L-mapfilter3 (2026-04-23): FilterAccordion 을 FilterModal 안으로
                이관한 뒤 사이드바는 SumBox (현재 조건 요약) 만 상단에 유지.
                이전 max-h-[55%] 스크롤 컨테이너는 아코디언이 사라지면서
                불필요 — SumBox 는 짧고 고정 크기이므로 일반 shrink-0 으로 충분.
                ListPanel 은 남은 공간 전체를 사용해 매물 카드·사진이 최대한
                많이 보이도록 한다. */}
            <div className="shrink-0 border-b border-neutral-100 bg-white p-2">
              <SumBox compact />
            </div>
            <div className="relative min-h-0 flex-1">
              <ListPanel />
            </div>
            <button
              onClick={toggleListPanel}
              aria-label="매물 리스트 접기"
              title="리스트 접기"
              className="absolute top-1/2 right-0 z-20 hidden h-10 w-4 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-r-md border border-neutral-200 bg-white shadow-sm transition hover:bg-neutral-50 md:flex"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
        )}

        <div className="relative h-full min-h-0">
          {/* Kakao 지도 컨테이너 — 인라인 style 로 100% fill 보장 */}
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{
              width: '100%',
              height: '100%',
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              overscrollBehavior: 'contain',
            }}
          />
          {ready && kakaoMap ? (
            <>
              {/* Wave 63 (사장님 명령 2026-05-04): z13 = polygon zone, z14+ = marker zone 분리.
                   kakaoLevel <= 6 (z14 이상 줌인) 일 때만 마커 mount.
                   z13 (level 7) 이상 광역 = AdminRegionOverlay 폴리곤만 표시. */}
              {kakaoLevel <= 6 && (useCanvas ? (
                <CanvasMarkerLayer
                  map={kakaoMap}
                  container={containerRef.current}
                  listings={listings}
                  selectedListingId={detailListingId}
                  category={filterCategory}
                  clusterFilterIds={clusterFilterIds}
                  clusterFilterListings={clusterFilterListings}
                  onClickListing={onClickListing}
                  onClusterFilter={(ids, label) => setClusterFilter(ids, label)}
                />
              ) : useSvg && (
                <SvgMarkerLayer
                  map={kakaoMap}
                  container={containerRef.current}
                  listings={listings}
                  selectedListingId={detailListingId}
                  category={filterCategory}
                  clusterFilterIds={clusterFilterIds}
                  clusterFilterListings={clusterFilterListings}
                  onClickListing={onClickListing}
                  onClusterFilter={(ids, label) => setClusterFilter(ids, label)}
                  serverClusters={serverClusters}
                />
              ))}
              {/* Wave 66 (사장님 명령 2026-05-04): KakaoDeckOverlay 완전 제거 (R-D1).
                   Wave 62 의 items=[]/clusters=[] 부분 fix 만으로는 deck.gl WebGL canvas + mousemove
                   listener 가 mount 되어 잠재 충돌. JSX 자체 제거 = 100% 안전. */}
              {/* Wave 66: MapOverlaysWithClusters wrapper 제거 (R-D2) +
                   HtmlMarkerOverlay 영구 제거 (R-A2). AdminRegionOverlay 만 z13 폴리곤 zone 활성. */}
              {kakaoLevel >= 7 && (
                <MapErrorBoundary>
                  <AdminRegionOverlay map={kakaoMap} listings={listings} />
                </MapErrorBoundary>
              )}
              <GeoLoadingIndicator />
            </>
          ) : null}
          <SemanticZoomIndicator />
          <MapControls />
          <MiniCard />
          {/* L-filterpanel1 (2026-04-23 p.m.): 필터 패널도 지도 영역 내부 좌측으로.
              매물 상세 패널(z-30)과 같은 자리. 필터는 z-20 이라 매물 상세가 열리면
              가려짐 (기본 상태에선 필터만 보이는 구조). 둘이 공존하되 사용자 의도대로
              겹쳐 표시 — 매물 미선택 시 필터 위치, 매물 선택 시 상세 위치. */}
          <FilterModal />
          {/* L-slidepanel2 (2026-04-23): 슬라이드 패널을 지도 영역 내부로 이동.
              지도 영역의 left-0 에 위치 → ListPanel 바로 오른쪽에 자연스럽게 붙음.
              네이버·직방 스타일. 이전 fixed right-0 (지도 우측 모서리) 은 부자연스러움. */}
          <ListingDetailModal />
        </div>
      </div>
      {/* L-naver-2026bottomsheet1 (2026-04-27): 모바일 하단 시트 (md 미만에서만).
          드래그/탭 토글 — peek (72px) / mid (50vh) / full (90vh). */}
      <MobileListSheet />

      {/* L-v7-toast (2026-04-22): 단축 URL 복사 토스트 (v7 §9 3-state).
          루트에 1회 마운트되어 어디서든 useCopyToast().show() 로 제어. */}
      <CopyToastOutlet />
    </div>
  );
}

// 좁은 창에서 브랜드 영역 축소 — md 이하 W 로고, md+ 워드마크.
// L-mapfilter4 (2026-04-23): 'MAP 2026' 그래디언트 배지 제거.
//   의미 없는 코드네임 잔재로 사용자 피드백.
function Brand() {
  return (
    <Link href="/" aria-label="WISHES 홈" className="flex shrink-0 items-center gap-2">
      <div className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-[14px] font-extrabold text-white">
        W
      </div>
      <span className="hidden text-[16px] font-bold tracking-tight text-neutral-900 md:inline">
        WISHES
      </span>
    </Link>
  );
}

// L-mapfilter4 (2026-04-23): /map 은 사이트 전역 Header 가 숨겨지므로
// 기본 Header 가 제공하던 [매물내놓기]·[로그인/회원가입] 액션을 자체 렌더.
// 사용자 피드백: "우측 상단에는 매물내놓기 로그인/회원가입"
//
//   · 비로그인 → [매물내놓기] (primary) + [로그인/회원가입] (ghost)
//   · 로그인   → [매물내놓기] + "{name}님" + [로그아웃]
//
// useAuth().setShowAuthModal(true) 는 루트 레이아웃에 마운트된 <AuthModal/>
// (login + signup 탭 포함) 을 연다. /map 에서도 AuthProvider 가 유효하므로
// 동일 패턴 재사용 가능.
function TopRightActions() {
  const { user, signOut, setShowAuthModal } = useAuth();
  // G-25 fix (2026-05-03): ws_user (admin 자체 로그인) fallback.
  //   사장님이 admin-auth.html 또는 OAuth 후 admin 로그인했을 때 ws_user 만 있고
  //   Supabase native session 은 hydration 직후 비어있을 수 있음.
  //   /map 헤더가 "로그인/회원가입" 으로 잘못 표시되는 결함 fix.
  const [wsUser, setWsUser] = useState<{ name?: string; email?: string; role?: string } | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ws_user') || window.sessionStorage.getItem('ws_user');
      if (raw) setWsUser(JSON.parse(raw));
    } catch {}
  }, []);

  const effectiveLoggedIn = !!user || !!wsUser;
  if (effectiveLoggedIn) {
    const name =
      (user?.user_metadata as { full_name?: string } | undefined)?.full_name ||
      wsUser?.name ||
      user?.email?.split('@')[0] ||
      wsUser?.email?.split('@')[0] ||
      '회원';
    return (
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <Link
          href="/contact"
          className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 sm:px-3.5 py-1.5 text-[11.5px] sm:text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 whitespace-nowrap"
        >
          매물내놓기
        </Link>
        <span className="hidden text-[12.5px] text-neutral-700 lg:inline">
          {name}님
        </span>
        <button
          onClick={signOut}
          className="px-1.5 sm:px-2 py-1 text-[11.5px] sm:text-[12px] text-neutral-500 hover:text-neutral-900 whitespace-nowrap"
        >
          로그아웃
        </button>
      </div>
    );
  }
  return (
    <div className="ml-auto flex items-center gap-1 shrink-0">
      <Link
        href="/contact"
        className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 sm:px-3.5 py-1.5 text-[11.5px] sm:text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 whitespace-nowrap"
      >
        매물내놓기
      </Link>
      <button
        onClick={() => setShowAuthModal(true)}
        className="inline-flex items-center gap-1 rounded-full px-2 sm:px-3 py-1.5 text-[11.5px] sm:text-[12.5px] font-medium text-neutral-700 hover:bg-neutral-100 whitespace-nowrap"
        aria-label="로그인 또는 회원가입"
      >
        <LogIn className="size-3.5" />
        <span className="hidden sm:inline">로그인/회원가입</span>
        <span className="sm:hidden">로그인</span>
      </button>
    </div>
  );
}

// Wave 66 (사장님 명령 2026-05-04): MapOverlaysWithClusters wrapper 영구 제거 (R-D2).
//   useMapClusters 호출 이미 제거됨 (G-114). HtmlMarkerOverlay 도 제거 (R-A2).
//   AdminRegionOverlay 는 main render 에서 직접 mount (kakaoLevel >= 7 조건).


// L-naver-2026skel2: store 의 geoLoading 구독해서 MapLoadingIndicator 표시.
function GeoLoadingIndicator() {
  const loading = useMap2026Store((s) => s.geoLoading);
  return <MapLoadingIndicator show={loading} />;
}
