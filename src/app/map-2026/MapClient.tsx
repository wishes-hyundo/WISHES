// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClient — MapLibre + deck.gl + HTML hero pins + 필터바
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useMap2026Store } from '@/features/map-2026/store';
import { buildStyle, BUILDING_3D_LAYER_ID } from '@/features/map-2026/lib/mapStyle';
import { useViewport } from '@/features/map-2026/hooks/useViewport';
import { useSemanticZoom } from '@/features/map-2026/hooks/useSemanticZoom';
import { useHeroRanking } from '@/features/map-2026/hooks/useHeroRanking';
import { useIsochrone } from '@/features/map-2026/hooks/useIsochrone';
import { buildLayers } from '@/features/map-2026/layers';

import { NlSearchBar } from '@/features/map-2026/components/NlSearchBar';
import { SmartChips } from '@/features/map-2026/components/SmartChips';
import { ActiveFilterPills } from '@/features/map-2026/components/ActiveFilterPills';
import { ListPanel } from '@/features/map-2026/components/ListPanel';
import { MapControls } from '@/features/map-2026/components/MapControls';
import { SemanticZoomIndicator } from '@/features/map-2026/components/SemanticZoomIndicator';
import { MiniCard } from '@/features/map-2026/components/MiniCard';
import { HeroPinLayer } from '@/features/map-2026/components/HeroPinLayer';

// 서울 중심 기본
const SEOUL: [number, number] = [127.0276, 37.4979];

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  const setMap = useMap2026Store((s) => s.setMap);
  const setHover = useMap2026Store((s) => s.setHover);
  const selectListing = useMap2026Store((s) => s.selectListing);

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const map = new maplibregl.Map({
      container,
      style: buildStyle(),
      center: SEOUL,
      zoom: 12.3,
      pitch: 0,
      maxPitch: 60,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;

    map.on('load', () => {
      setMap(map, overlay);
      setReady(true);
      // 컨테이너가 0×0 에서 시작했을 수 있으므로 다음 프레임에 강제 리사이즈
      requestAnimationFrame(() => map.resize());
    });

    // 컨테이너 크기 변화 감지 → MapLibre 내부 뷰포트 동기화
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
  }, [setMap]);

  // 데이터 파이프라인
  useViewport();
  useSemanticZoom();
  useHeroRanking();
  useIsochrone();

  // deck.gl 레이어 diff
  const listings = useMap2026Store((s) => s.listings);
  const heroes = useMap2026Store((s) => s.heroes);
  const mode = useMap2026Store((s) => s.mode);
  const isochrone = useMap2026Store((s) => s.isochrone);
  const heatmap = useMap2026Store((s) => s.heatmap);
  const threeD = useMap2026Store((s) => s.threeD);
  const selectedId = useMap2026Store((s) => s.selectedId);
  const isochronePayload = useMap2026Store((s) => s.isochronePayload);

  useEffect(() => {
    if (!overlayRef.current || !ready) return;
    overlayRef.current.setProps({
      layers: buildLayers({
        listings,
        heroes,
        mode,
        isochrone,
        heatmap,
        threeD,
        similar: false,
        selectedId,
        isochronePayload,
        onHover: (info) => {
          if (info.object) setHover(info.object, info.x, info.y);
          else setHover(null);
        },
        onClick: (info) => {
          if (info.object) selectListing(info.object.id, true);
        },
      }),
    });
  }, [
    listings, heroes, mode, isochrone, heatmap, threeD,
    selectedId, isochronePayload, ready, setHover, selectListing,
  ]);

  // Phase D — 3D 토글 효과
  //   threeD on  → pitch 45 easeTo + buildings-3d 레이어 visible
  //   threeD off → pitch 0 easeTo + 레이어 none
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // style 로드 이후에만 setLayoutProperty 호출
    const apply = () => {
      if (!map.getLayer(BUILDING_3D_LAYER_ID)) return;
      map.setLayoutProperty(
        BUILDING_3D_LAYER_ID,
        'visibility',
        threeD ? 'visible' : 'none'
      );
      map.easeTo({
        pitch: threeD ? 45 : 0,
        duration: 650,
        essential: true,
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
  }, [threeD, ready]);

  return (
    // CRITICAL: grid-rows 에서 마지막 트랙을 `minmax(0,1fr)` 로 둬야 ListPanel 의
    // 긴 매물 리스트(수백개) 가 min-content 로 row 를 밀어서 지도 컨테이너를
    // 38,000px+ 까지 팽창시키는 사고를 막음.
    <div className="grid h-full grid-rows-[auto_auto_auto_minmax(0,1fr)]">
      {/* 헤더: 브랜드 + NL 검색 */}
      <header className="flex items-center gap-4 border-b border-neutral-100 bg-white px-4 py-2.5">
        <Brand />
        <NlSearchBar />
      </header>

      {/* 스마트 칩 (거래유형 + 핵심 필터) */}
      <SmartChips />

      {/* 활성 필터 pills */}
      <ActiveFilterPills />

      {/* 본문: 좌 리스트 / 우 지도 */}
      {/* 내부 grid-cols 도 같은 이유로 minmax(0,1fr) — 1fr 트랙이 자식 min-content 에
          눌려 커지는 걸 차단. h-full 은 부모 row 전체 높이를 물려받기 위해 필요. */}
      <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
        <ListPanel />
        <div className="relative h-full min-h-0">
          <div ref={containerRef} className="absolute inset-0" />
          <SemanticZoomIndicator />
          <MapControls />
          <HeroPinLayer />
          <MiniCard />
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-[14px] font-extrabold text-white">
        W
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[16px] font-bold tracking-tight text-neutral-900">
          WISHES
        </span>
        <span className="rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
          MAP 2026
        </span>
      </div>
    </div>
  );
}
