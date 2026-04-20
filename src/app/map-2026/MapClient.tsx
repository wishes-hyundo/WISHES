// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClient — MapLibre + deck.gl + HTML hero pins + 필터바
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useMap2026Store } from '@/features/map-2026/store';
import { buildStyle } from '@/features/map-2026/lib/mapStyle';
import { useViewport } from '@/features/map-2026/hooks/useViewport';
import { useSemanticZoom } from '@/features/map-2026/hooks/useSemanticZoom';
import { useHeroRanking } from '@/features/map-2026/hooks/useHeroRanking';
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
  const [ready, setReady] = useState(false);

  const setMap = useMap2026Store((s) => s.setMap);
  const setHover = useMap2026Store((s) => s.setHover);
  const selectListing = useMap2026Store((s) => s.selectListing);

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: SEOUL,
      zoom: 12.3,
      pitch: 0,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right'
    );

    map.on('load', () => {
      const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      setMap(map, overlay);
      setReady(true);
    });

    return () => {
      map.remove();
      overlayRef.current = null;
      setReady(false);
    };
  }, [setMap]);

  // 데이터 파이프라인
  useViewport();
  useSemanticZoom();
  useHeroRanking();

  // deck.gl 레이어 diff
  const listings = useMap2026Store((s) => s.listings);
  const heroes = useMap2026Store((s) => s.heroes);
  const mode = useMap2026Store((s) => s.mode);
  const isochrone = useMap2026Store((s) => s.isochrone);
  const heatmap = useMap2026Store((s) => s.heatmap);
  const threeD = useMap2026Store((s) => s.threeD);
  const selectedId = useMap2026Store((s) => s.selectedId);

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
        isochronePayload: null, // Phase 1.1 에서 서버 payload 주입
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
    selectedId, ready, setHover, selectListing,
  ]);

  return (
    <div className="grid h-full grid-rows-[auto_auto_auto_1fr]">
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
      <div className="grid grid-cols-[360px_1fr] overflow-hidden">
        <ListPanel />
        <div className="relative">
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
