// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KakaoDeckOverlay — 카카오맵 위에 Deck.gl WebGL 오버레이
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 🎯 목표: 카카오맵은 웹에서 여전히 비트맵 타일 기반이라 10만+ 마커 DOM 렌더가
//   스크롤·줌 시 수백 ms 급 jank 를 만든다. Deck.gl 의 GPU 레이어를 Kakao 지도 위에
//   절대 배치된 <canvas> 로 얹어서 좌표·줌 동기화만 처리하면 60fps 유지.
//
// 🧩 구조:
//   - 부모는 이미 초기화된 Kakao map 인스턴스를 prop 으로 전달
//   - 본 컴포넌트는 <canvas> 를 지도 컨테이너 절대 배치 (pointer-events: auto)
//   - Deck.gl `Deck` 를 mapbox 없이 standalone 으로 생성
//   - 카카오 이벤트(center_changed / zoom_changed) → Deck viewState 동기화
//
// 사용:
//   <KakaoDeckOverlay
//     map={kakaoMapRef.current}
//     clusters={clusters}
//     onClickCluster={(c) => ...}
//     onClickListing={(id) => ...}
//   />
//
// L-ux5-3 (2026-04-22): 가격 라벨 가독성 개선.
//   1) formatPriceShort 가 거래 유형을 받아 매매/전세 → "억", 월세/단기 → "만원"
//      으로 단위 일관화. 이전엔 price 크기만 보고 10000 이상이면 "억" 을 붙여서
//      월세 4500만원이 "4억5천만" 으로 표시되는 사고가 있었다.
//   2) 밀집 지역에서 TextLayer 가 모든 item 의 라벨을 그려 겹치는 현상을
//      52px 그리드-버킷 declutter 로 해소 — 같은 cell 내에서는 가격 가장 높은
//      item 하나만 라벨 표시. (CollisionFilterExtension 은 deps 에 없어서
//      클라이언트 측 간단 bucket 으로 구현)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { Deck } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';

export interface MapCluster {
  cluster_id: string;
  lat: number;
  lng: number;
  count: number;
  min_price?: number | null;
  avg_price?: number | null;
  max_price?: number | null;
  sample_ids?: number[] | null;
  // Wave 25b (2026-05-04): cluster 안 모든 매물 ID — cluster click 시 setClusterFilter 에 전달.
  all_ids?: number[] | null;
  // Wave 25b: cluster 색상 카테고리 — DOM 마커 (HtmlMarkerOverlay) 와 일치.
  category?: 'residence' | 'retail_office' | 'land' | 'investment' | null;
}

export interface MapItem {
  id: number;
  lat: number;
  lng: number;
  price_unified?: number | null;
  type?: string | null;
  deal?: string | null;
  thumb_url?: string | null;
}

interface Props {
  map: unknown; // kakao.maps.Map instance
  /**
   * 지도 컨테이너 DOM 요소. L-map3 (2026-04-22):
   * Kakao Maps JS SDK v2 의 Map 인스턴스는 `getContainer()` 메서드를 노출하지
   * 않는다 (MapLibre/Google Maps 와 다른 지점). 이 때문에 이전 구현은
   * `map.getContainer?.()` 가 undefined 를 반환하면서 effect 가 early-return 하여
   * canvas 가 아예 생성되지 않았다. 상위(MapClient)가 `new kakao.maps.Map(el, ...)`
   * 에 넘긴 동일한 ref 를 명시적으로 prop 으로 내려받는다.
   */
  container?: HTMLElement | null;
  clusters?: MapCluster[];
  items?: MapItem[];
  onClickCluster?: (c: MapCluster) => void;
  onClickListing?: (id: number) => void;
  /** 매물 개수 → 버블 색 스케일 (기본값: 3단계 파란색) */
  colorScale?: (count: number) => [number, number, number, number];
}

function defaultColorScale(count: number): [number, number, number, number] {
  // 위시스 브랜드 톤 (indigo-500 ~ indigo-700) — Wave 24 병렬 모드 디버그 용 fallback.
  if (count >= 100) return [79, 70, 229, 230];
  if (count >= 30) return [99, 102, 241, 220];
  if (count >= 10) return [129, 140, 248, 210];
  if (count >= 2) return [165, 180, 252, 200];
  return [219, 39, 119, 210];
}

// Wave 25b (2026-05-04 사장님 명령): WebGL cluster 색상을 DOM 마커 (HtmlMarkerOverlay) 와 일치.
//   residence=emerald #006241 / retail_office=amber #b45309 / land=brown #78350f / investment=violet #7e22ce
//   투명도 alpha 174 (DOM 의 0.68 과 동일).
function categoryColorScale(c: MapCluster): [number, number, number, number] {
  const cat = c.category;
  if (cat === 'retail_office') return [180, 83, 9, 220];
  if (cat === 'land') return [120, 53, 15, 220];
  if (cat === 'investment') return [126, 34, 206, 220];
  return [0, 98, 65, 220]; // residence default
}

/**
 * L-ux5-3: 거래 유형별 단위 분기
 *   매매/전세 → 억 (10000만원 이상이면)
 *   월세/단기 → 만원 그대로 (deposit/monthly 는 본래 만원 단위)
 *   deal 이 없으면 기존 방식(크기 기반 억 환산) 유지 — 주로 cluster avg_price
 */
function formatPriceShort(won?: number | null, deal?: string | null): string {
  if (!won || won <= 0) return '';
  const d = (deal ?? '').trim();
  const isRent = d === '월세' || d === '단기';
  if (isRent) {
    // 월세·단기는 보증금/월세 모두 "만원" 단위로 저장된다고 가정
    // 1만 이상(=1억 이상)은 "N억" 으로 축약하지 않고 그대로 표시 (보증금 1.5억 = "15000")
    if (won >= 10000) {
      const 억 = Math.floor(won / 10000);
      const 천 = Math.floor((won % 10000) / 1000);
      return 천 === 0 ? `${억}억` : `${억}.${천}억`;
    }
    return `${won.toLocaleString()}`;
  }
  // 매매/전세 + 기본값
  if (won >= 10000) {
    const 억 = Math.floor(won / 10000);
    const 만 = won % 10000;
    if (만 === 0) return `${억}억`;
    return `${억}.${Math.floor(만 / 1000)}억`;
  }
  return `${won.toLocaleString()}`;
}

// Wave 26.8 TRACE (2026-05-04): Next.js production compiler strips console.log.
//   Replace with window.__wave26_8_trace__ array push for prod-readable diagnostics.
//   Read via Chrome MCP: window.__wave26_8_trace__
function _w268trace(tag: string, data?: unknown) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __wave26_8_trace__?: Array<{ tag: string; t: number; data?: unknown }> };
  if (!w.__wave26_8_trace__) w.__wave26_8_trace__ = [];
  w.__wave26_8_trace__.push({ tag, t: performance.now(), data });
  // Cap at 500 entries to avoid memory blow-up on long sessions
  if (w.__wave26_8_trace__.length > 500) w.__wave26_8_trace__ = w.__wave26_8_trace__.slice(-500);
}

export default function KakaoDeckOverlay({
  map,
  container: containerProp,
  clusters = [],
  items = [],
  onClickCluster,
  onClickListing,
  colorScale = defaultColorScale,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const deckRef = useRef<Deck | null>(null);

  // 지도 mount 후 캔버스 + Deck 생성
  useEffect(() => {
    // Wave 26.8 DEBUG (2026-05-04): WebGL invisible 진단 — Wave 26/26.2/26.6 회귀 원인 파악용 console.log.
    //   prod 검증 후 로그만 정리하고 fix 또는 다음 path 결정. INVARIANT 영향 0.
    _w268trace('deck-init-1 effect-1 start', { hasMap: !!map, hasContainer: !!containerProp });
    if (!map || typeof window === 'undefined') return;
    // L-map3 (2026-04-22): Kakao Map 인스턴스는 getContainer() 를 노출하지 않음.
    //   1) 상위가 직접 내려주는 containerProp 우선
    //   2) (혹시 노출되는 경우를 위해) map.getContainer() fallback
    const kakaoMap = map as { getContainer?: () => HTMLElement };
    const container = containerProp ?? kakaoMap.getContainer?.();
    if (!container) return;

    // 캔버스 요소 추가
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // 지도 팬/줌은 기본 지도가 담당
    canvas.style.zIndex = '5';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // L-mapres1 (2026-04-22): 캔버스 intrinsic 해상도를 컨테이너 크기 × DPR 로 맞춘다.
    //   (이전에는 canvas.style 만 100% 로 두고 canvas.width/height 는 설정하지 않아
    //   브라우저 기본값 300×150 으로 고정, CSS 로 1100×498 등으로 업스케일 → 핀/라벨/
    //   텍스트가 3~4 배 블러링 상태로 렌더되던 문제. DPR=2 라면 2200×996 픽셀 버퍼가
    //   필요하다.) ResizeObserver 로 컨테이너 변경 시 즉시 재동기화.
    const syncCanvasSize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return; // 마운트 초기 0×0 스킵 — RO 가 후속 콜.
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      // deck.gl 도 논리 width/height 를 갱신해야 내부 viewport 가 재계산된다.
      deckRef.current?.setProps({ width: w, height: h });
    };
    syncCanvasSize();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => syncCanvasSize())
      : null;
    ro?.observe(container);

    // deck.gl 초기화
    // L-map1 (2026-04-21): WebGL 생성 실패를 로컬에서 try/catch 로 삼킨다.
    //   헤드리스 Chrome / WebGL 비활성 브라우저 / 구식 GPU 환경에서 WebGL 컨텍스트
    //   생성이 실패하면 unhandled rejection 으로 전파되어 전역 error.tsx 가 /map
    //   전체를 에러 페이지로 덮어쓰던 문제를 해소. 오버레이만 조용히 스킵하고
    //   카카오맵(비트맵) 은 정상 표시되도록 함.
    let disposed = false;
    let deck: any = null;
    (async () => {
      try {
        const mod = await import('@deck.gl/core');
        if (disposed) return;
        const { Deck: DeckCtor, OrthographicView } = mod as typeof import('@deck.gl/core');
        deck = new DeckCtor({
          canvas,
          views: [new OrthographicView()],
          controller: false,
          initialViewState: { target: [0, 0, 0], zoom: 0 } as any,
          layers: [],
          style: { position: 'absolute' },
          // Deck 내부 비동기 렌더 에러(webglcontextlost 등)도 동일하게 격리
          onError: (e: unknown) => {
            if (typeof console !== 'undefined') {
              console.warn('[KakaoDeckOverlay] deck.gl runtime error (fallback to 2D map):', e);
            }
          },
        });
        deckRef.current = deck;
        _w268trace('deck-init-2 deck assigned', { deckTruthy: !!deck });
      } catch (e) {
        _w268trace('deck-init-3 FAILED', { error: String(e) });
        console.warn('[wave26-8 deck-init-3] FAILED', performance.now(), e);
        if (typeof console !== 'undefined') {
          console.warn('[KakaoDeckOverlay] WebGL 초기화 실패 → 카카오맵 2D 만 표시합니다:', e);
        }
        // canvas 도 정리 (빈 검정 레이어 방지)
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        canvasRef.current = null;
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      deck?.finalize();
      deckRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map, containerProp]);

  // clusters/items 변경 시 레이어 업데이트
  // L-mapsync1 (2026-04-23): drag / zoom_changed / center_changed 이벤트로
  //   레이어를 재빌드하여 "지도가 움직이면 마커가 따로 논다" 피드백 해소.
  //   이전에는 상위(MapClient) 가 'idle' 하나만 구독 → items prop 변경 → layer 재빌드
  //   경로로 의존하고 있어서 드래그 중엔 project() 가 옛 픽셀 좌표를 유지,
  //   카카오 타일은 실시간으로 움직여 마커가 "붕 떠 보이는" 상태가 되었다.
  //   이제 오버레이 자체가 지도 이벤트를 듣고 requestAnimationFrame 으로
  //   throttle 된 재투영을 수행한다.
  useEffect(() => {
    // Wave 26.8 DEBUG: useEffect #2 매 실행 시점 + early return 분기 캡처.
    _w268trace('layer-build-1 effect-2 run', { hasDeck: !!deckRef.current, hasMap: !!map, clusters: clusters.length, items: items.length });
    if (!deckRef.current || !map) {
      _w268trace('layer-build-2 EARLY RETURN', { hasDeck: !!deckRef.current, hasMap: !!map });
      return;
    }

    const kakaoMap = map as {
      getProjection?: () => {
        pointFromCoords: (c: unknown) => { x: number; y: number };
      };
      getContainer?: () => HTMLElement;
    };
    // L-map3: Kakao 는 getContainer() 가 없음 → prop fallback
    const container = containerProp ?? kakaoMap.getContainer?.();
    if (!container) {
      _w268trace('layer-build-2b EARLY RETURN no container');
      return;
    }

    const buildLayers = () => {
      _w268trace('layer-build-3 buildLayers entry', { hasDeck: !!deckRef.current });
      if (!deckRef.current) {
        _w268trace('layer-build-3a EARLY RETURN no deck');
        return;
      }
      const projection = kakaoMap.getProjection?.();
      if (!projection) {
        _w268trace('layer-build-3b EARLY RETURN no projection');
        return;
      }

      const w = container.clientWidth;
      const h = container.clientHeight;

      // lat/lng → 화면 픽셀 → deck Orthographic 좌표 (원점 중심)
      const project = (lat: number, lng: number): [number, number] => {
        const kakao = (window as unknown as { kakao: { maps: { LatLng: new (lat: number, lng: number) => unknown } } }).kakao;
        const latlng = new kakao.maps.LatLng(lat, lng);
        const p = projection.pointFromCoords(latlng);
        return [p.x - w / 2, -(p.y - h / 2)];
      };

      // 클러스터 레이어 (≥2 개수)
      const clusterData = clusters.filter((c) => c.count >= 2);
    // 개별 매물 레이어 (L-deck-noprice, 2026-04-24 pm)
    //   HtmlMarkerOverlay 가 개별 매물을 카운트 원으로 처리하므로, deck.gl 의
    //   itemScatter/itemText 는 상위에서 items 를 명시적으로 넘긴 경우에만 활성화.
    //   이전엔 items=[] 이어도 clusters.count===1 을 items 로 치환해 가격
    //   라벨이 찍혀 '최대확대에서 금액 노출' 현상이 있었음 — 사용자 리스크.
    //   L-deck-noprice2 (2026-04-24 pm): MapItem | MapCluster 유니언 타입 유지
    //     — 하위 `(d as MapCluster)` 캐스팅이 좁은 MapItem 타입에서 컴파일 오류나 Vercel 빌드 깨짐.
    const itemData: (MapItem | MapCluster)[] = items.length > 0 ? items : [];

    // L-ux5-3: 그리드-버킷 declutter.
    //   화면 52px 셀 안에 같은 가격 라벨을 여러 개 그리면 겹쳐서 알아볼 수 없다.
    //   각 셀에서 price 가장 높은 1개만 남기고 나머지는 라벨 생략 (ScatterPlot 점은
    //   그대로 표시 — 클릭은 여전히 가능).
    // L-map-audit1 (2026-04-23): 52px 셀에서는 밀집 지역 라벨 4~5개가
    //   한 줄에 겹쳐 읽을 수 없었다. 72px (카드 한 폭) 셀로 확대해 가독성을
    //   확보. 셀 안에서 가장 비싼 매물이 라벨을 가져가므로 시선 진입점은
    //   유지되고 정보 손실은 최소.
    const declutterCell = 72;
    const labelBuckets = new Map<string, MapItem | MapCluster>();
    for (const d of itemData) {
      const [projX, projY] = project(d.lat, d.lng);
      // project 는 Orthographic 원점 중심 좌표 → 화면 픽셀로 환산
      const screenX = projX + w / 2;
      const screenY = -projY + h / 2;
      const key = `${Math.round(screenX / declutterCell)},${Math.round(screenY / declutterCell)}`;
      const price =
        (d as MapItem).price_unified ??
        (d as MapCluster).avg_price ??
        0;
      const existing = labelBuckets.get(key);
      const existingPrice = existing
        ? (existing as MapItem).price_unified ?? (existing as MapCluster).avg_price ?? 0
        : -1;
      if (!existing || (price ?? 0) > (existingPrice ?? 0)) {
        labelBuckets.set(key, d);
      }
    }
    const labelData = Array.from(labelBuckets.values());

    const scatter = new ScatterplotLayer({
      id: 'clusters',
      data: clusterData,
      pickable: true,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1.5,
      getPosition: (d: MapCluster) => [...project(d.lat, d.lng), 0],
      getRadius: (d: MapCluster) =>
        Math.min(56, 14 + Math.log2(d.count) * 4),
      // Wave 25b: cluster.category 기반 색상 (DOM 과 일치). count 기반 colorScale 은 fallback.
      getFillColor: (d: MapCluster) => (d.category ? categoryColorScale(d) : colorScale(d.count)),
      getLineColor: () => [255, 255, 255, 255],
      onClick: ({ object }) => {
        if (object && onClickCluster) onClickCluster(object as MapCluster);
      },
      updateTriggers: {
        getPosition: clusters.length,
      },
    });

    const clusterText = new TextLayer({
      id: 'cluster-labels',
      data: clusterData,
      pickable: false,
      getPosition: (d: MapCluster) => [...project(d.lat, d.lng), 0],
      getText: (d: MapCluster) =>
        d.count >= 1000 ? `${Math.floor(d.count / 1000)}k` : String(d.count),
      getColor: () => [255, 255, 255, 255],
      getSize: () => 13,
      fontWeight: 'bold',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      sizeUnits: 'pixels',
      updateTriggers: {
        getPosition: clusters.length,
      },
    });

    const itemScatter = new ScatterplotLayer({
      id: 'items',
      data: itemData,
      pickable: true,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1.5,
      getPosition: (d: MapItem | MapCluster) => [...project(d.lat, d.lng), 0],
      getRadius: () => 10,
      getFillColor: () => [219, 39, 119, 230],
      getLineColor: () => [255, 255, 255, 255],
      onClick: ({ object }) => {
        if (!object) return;
        const id =
          (object as MapItem).id ??
          (object as MapCluster).sample_ids?.[0];
        if (id && onClickListing) onClickListing(id);
      },
      updateTriggers: {
        getPosition: itemData.length,
      },
    });

    // L-ux5-3: itemText 는 itemScatter 와 달리 labelData (declutter 된 부분집합)
    //   만 받는다 — 그려지는 점(=pickable) 은 유지하면서 텍스트만 솎아낸다.
    const itemText = new TextLayer({
      id: 'item-labels',
      data: labelData,
      pickable: false,
      getPosition: (d: MapItem | MapCluster) => [
        ...project(d.lat, d.lng + 0.0004),
        0,
      ],
      getText: (d: MapItem | MapCluster) => {
        const p = (d as MapItem).price_unified ?? (d as MapCluster).avg_price ?? 0;
        const deal = (d as MapItem).deal ?? null;
        return formatPriceShort(p, deal);
      },
      getColor: () => [31, 41, 55, 255], // gray-800
      getSize: () => 11,
      fontWeight: '600',
      background: true,
      // L-map-audit1 (2026-04-23): alpha 235→250, padding [4,2]→[8,4].
      //   배경을 더 불투명하게 하여 타일 위에서 라벨이 번지는 것을 막고,
      //   padding 을 늘려 인접 라벨과의 시각적 간격을 확보한다
      //   (declutterCell 확대와 한 세트).
      getBackgroundColor: () => [255, 255, 255, 250],
      backgroundPadding: [8, 4],
      sizeUnits: 'pixels',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      updateTriggers: {
        getPosition: labelData.length,
        getText: labelData.length,
      },
    });

      deckRef.current.setProps({
        width: w,
        height: h,
        viewState: { target: [0, 0, 0], zoom: 0 } as any,
        layers: [scatter, clusterText, itemScatter, itemText],
      });
      _w268trace('layer-build-4 setProps DONE', { clusterData: clusterData.length, itemData: itemData.length, labelData: labelData.length });
    };

    // 초기 빌드
    buildLayers();

    // L-mapsync1 (2026-04-23): 카카오 지도 이벤트 → RAF throttle → buildLayers.
    //   `drag` 는 드래그 중 고빈도로 발화하므로 rAF 에 하나만 예약. `zoom_changed`·
    //   `center_changed` 도 같은 채널을 재사용해 재렌더 폭주를 방지.
    //   cleanup 에서 Kakao removeListener 로 구독 해제 + rAF 취소.
    const kakaoNS = (window as unknown as {
      kakao?: {
        maps?: {
          event?: {
            addListener: (target: unknown, type: string, handler: () => void) => void;
            removeListener: (target: unknown, type: string, handler: () => void) => void;
          };
        };
      };
    }).kakao;
    const kakaoEvent = kakaoNS?.maps?.event;

    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        buildLayers();
      });
    };

    if (kakaoEvent) {
      kakaoEvent.addListener(map, 'drag', scheduleSync);
      kakaoEvent.addListener(map, 'zoom_changed', scheduleSync);
      kakaoEvent.addListener(map, 'center_changed', scheduleSync);
    }

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (kakaoEvent) {
        try { kakaoEvent.removeListener(map, 'drag', scheduleSync); } catch { /* noop */ }
        try { kakaoEvent.removeListener(map, 'zoom_changed', scheduleSync); } catch { /* noop */ }
        try { kakaoEvent.removeListener(map, 'center_changed', scheduleSync); } catch { /* noop */ }
      }
    };
  }, [map, containerProp, clusters, items, colorScale, onClickCluster, onClickListing]);

  // pointer-events: auto 처리 — 클러스터/매물 클릭은 받고 싶지만 팬은 지도로 넘긴다.
  // Deck.gl 은 canvas pointer-events: none 이어도 onClick 동작 X → 동적 토글 전략 사용.
  useEffect(() => {
    const canvas = canvasRef.current;
    // L-map3: Kakao 는 getContainer() 가 없음 → prop fallback
    const container = containerProp ?? (map as { getContainer?: () => HTMLElement } | null)?.getContainer?.();
    if (!canvas || !container) return;

    // 마우스 이동 시 deck.pickObject 로 hit 이 있으면 pointer 허용, 아니면 막는다.
    const handler = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = deckRef.current?.pickObject({ x, y, radius: 2 });
      canvas.style.pointerEvents = hit ? 'auto' : 'none';
    };
    container.addEventListener('mousemove', handler, { passive: true });
    return () => container.removeEventListener('mousemove', handler);
  }, [map, containerProp]);

  return null;
}
