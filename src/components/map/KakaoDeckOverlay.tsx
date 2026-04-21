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
  clusters?: MapCluster[];
  items?: MapItem[];
  onClickCluster?: (c: MapCluster) => void;
  onClickListing?: (id: number) => void;
  /** 매물 개수 → 버블 색 스케일 (기본값: 3단계 파란색) */
  colorScale?: (count: number) => [number, number, number, number];
}

function defaultColorScale(count: number): [number, number, number, number] {
  // 위시스 브랜드 톤 (indigo-500 ~ indigo-700)
  if (count >= 100) return [79, 70, 229, 230]; // indigo-600
  if (count >= 30) return [99, 102, 241, 220]; // indigo-500
  if (count >= 10) return [129, 140, 248, 210]; // indigo-400
  if (count >= 2) return [165, 180, 252, 200]; // indigo-300
  return [219, 39, 119, 210]; // pink-600 (개별 매물)
}

function formatPriceShort(won?: number | null): string {
  if (!won || won <= 0) return '';
  if (won >= 10000) {
    const 억 = Math.floor(won / 10000);
    const 만 = won % 10000;
    if (만 === 0) return `${억}억`;
    return `${억}.${Math.floor(만 / 1000)}억`;
  }
  return `${won.toLocaleString()}`;
}

export default function KakaoDeckOverlay({
  map,
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
    if (!map || typeof window === 'undefined') return;
    const kakaoMap = map as { getContainer?: () => HTMLElement; getCenter?: () => { getLat: () => number; getLng: () => number }; getLevel?: () => number };
    const container = kakaoMap.getContainer?.();
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

    // deck.gl 초기화
    // L-map1 (2026-04-21): WebGL 생성 실패를 로컬에서 try/catch 로 삼킨다.
    //   헤드리스 Chrome / WebGL 비활성 브라우저 / 구식 GPU 환경에서 WebGL 컨텍스트
    //   생성이 실패하면 unhandled rejection 으로 전파되어 전역 error.tsx 가 /map
    //   전체를 에러 페이지로 덮어쓰던 문제를 해소. 오버레이만 조용히 스킵하고
    //   카카오맵(비트맵) 은 정상 표시되도록 함.
    let disposed = false;
    let deck: Deck | null = null;
    (async () => {
      try {
        const mod = await import('@deck.gl/core');
        if (disposed) return;
        const { Deck: DeckCtor, OrthographicView } = mod as typeof import('@deck.gl/core');
        deck = new DeckCtor({
          canvas,
          views: [new OrthographicView()],
          controller: false,
          initialViewState: { target: [0, 0, 0], zoom: 0 },
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
      } catch (e) {
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
      deck?.finalize();
      deckRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map]);

  // clusters/items 변경 시 레이어 업데이트
  useEffect(() => {
    if (!deckRef.current || !map) return;

    const kakaoMap = map as {
      getProjection?: () => {
        pointFromCoords: (c: unknown) => { x: number; y: number };
      };
      getContainer?: () => HTMLElement;
    };
    const projection = kakaoMap.getProjection?.();
    const container = kakaoMap.getContainer?.();
    if (!projection || !container) return;

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
    // 개별 매물 레이어
    const itemData = items.length > 0
      ? items
      : clusters.filter((c) => c.count === 1);

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
      getFillColor: (d: MapCluster) => colorScale(d.count),
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
    });

    const itemText = new TextLayer({
      id: 'item-labels',
      data: itemData,
      getPosition: (d: MapItem | MapCluster) => [
        ...project(d.lat, d.lng + 0.0004),
        0,
      ],
      getText: (d: MapItem | MapCluster) => {
        const p = (d as MapItem).price_unified ?? (d as MapCluster).avg_price ?? 0;
        return formatPriceShort(p);
      },
      getColor: () => [31, 41, 55, 255], // gray-800
      getSize: () => 11,
      fontWeight: '600',
      background: true,
      getBackgroundColor: () => [255, 255, 255, 235],
      backgroundPadding: [4, 2],
      sizeUnits: 'pixels',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
    });

    deckRef.current.setProps({
      width: w,
      height: h,
      viewState: { target: [0, 0, 0], zoom: 0 },
      layers: [scatter, clusterText, itemScatter, itemText],
    });
  }, [map, clusters, items, colorScale, onClickCluster, onClickListing]);

  // pointer-events: auto 처리 — 클러스터/매물 클릭은 받고 싶지만 팬은 지도로 넘긴다.
  // Deck.gl 은 canvas pointer-events: none 이어도 onClick 동작 X → 동적 토글 전략 사용.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = (map as { getContainer?: () => HTMLElement } | null)?.getContainer?.();
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
  }, [map]);

  return null;
}
