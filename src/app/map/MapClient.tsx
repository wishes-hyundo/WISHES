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
  // L-map1 (2026-04-21): WebGL 실패 시 전역 에러 바운더리로 튀지 않고
  //   /map 안에서 '지도 로드 실패 — /listings 로 이동' 폴백을 노출.
  const [webglFailed, setWebglFailed] = useState(false);
  // L-mapfix2 (2026-04-21): Chrome/Edge Speculation Rules 로 /map 이 prerender
  //   컨텍스트에서 먼저 로드되면 document.prerendering=true 상태에서 WebGL
  //   컨텍스트가 생성돼 activation 후 canvas 가 흰색으로 남는 현상이 있었다.
  //   SpeculationRules.tsx 에서 /map 을 제외했지만, 3rd-party speculation 이나
  //   브라우저 기본 프리로드 heuristic 에 대비해 defensive 로 init 을 유예한다.
  const [prerendering, setPrerendering] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return !!(document as unknown as { prerendering?: boolean }).prerendering;
  });

  const setMap = useMap2026Store((s) => s.setMap);
  const setHover = useMap2026Store((s) => s.setHover);
  const selectListing = useMap2026Store((s) => s.selectListing);
  // L-ux2 (2026-04-22): ListPanel 접힘 상태 — 좁은 뷰포트에서 지도 캔버스 확보.
  const listPanelCollapsed = useMap2026Store((s) => s.listPanelCollapsed);
  const toggleListPanel = useMap2026Store((s) => s.toggleListPanel);
  const listingsCount = useMap2026Store((s) => s.listings.length);

  // prerenderingchange → activation 시 1회 발생. 이후 정상 init 파이프라인으로 진입.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!(document as unknown as { prerendering?: boolean }).prerendering) return;
    const onActivate = () => setPrerendering(false);
    document.addEventListener('prerenderingchange', onActivate);
    return () => document.removeEventListener('prerenderingchange', onActivate);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (prerendering) return;
    if (!containerRef.current) return;
    const container = containerRef.current;

    // L-map1 (2026-04-21): MapLibre 생성자는 WebGL 컨텍스트를 sync 로 요구한다.
    //   WebGL 비활성 / 구식 GPU / 헤드리스(Lighthouse CI) 환경에서 여기서 throw 되면
    //   useEffect 가 react error boundary 로 올려보내 전역 error.tsx 가 /map 을
    //   통째로 덮어쓰던 현상 해소. 라우트 안에서 가벼운 폴백으로 전환.
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: buildStyle(),
        center: SEOUL,
        zoom: 12.3,
        pitch: 0,
        maxPitch: 60,
        attributionControl: { compact: true },
      });
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[MapClient] MapLibre/WebGL 초기화 실패 → 폴백 UI 표시:', e);
      }
      setWebglFailed(true);
      return;
    }
    mapRef.current = map;

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;

    // deck.gl / MapLibre 런타임 렌더 에러(webglcontextlost 등)도 동일하게 격리
    map.on('error', (ev: unknown) => {
      if (typeof console !== 'undefined') {
        console.warn('[MapClient] MapLibre runtime error:', ev);
      }
    });

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
  }, [setMap, prerendering]);

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

  // L-map1 (2026-04-21): WebGL 불가 환경 폴백 — 라우트 안에서 리스트 링크 제공
  if (webglFailed) {
    return (
      <div className="grid h-full place-items-center bg-wishes-cream/40 px-4">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-lg font-bold text-wishes-primary">
            이 브라우저에서는 지도를 불러올 수 없어요
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            WebGL 이 비활성화되어 있거나 지원되지 않는 환경입니다. 대신 목록에서 매물을 확인해 보세요.
          </p>
          <a
            href="/listings"
            className="inline-flex items-center justify-center rounded-xl bg-wishes-primary px-5 py-3 text-sm font-bold text-white hover:bg-wishes-secondary"
          >
            매물 목록 보기
          </a>
        </div>
      </div>
    );
  }

  return (
    // CRITICAL: grid-rows 에서 마지막 트랙을 `minmax(0,1fr)` 로 둬야 ListPanel 의
    // 긴 매물 리스트(수백개) 가 min-content 로 row 를 밀어서 지도 컨테이너를
    // 38,000px+ 까지 팽창시키는 사고를 막음.
    <div className="grid h-full grid-rows-[auto_auto_auto_minmax(0,1fr)]">
      {/* 헤더: 브랜드 + NL 검색 (L-ux1: py-2.5 → py-2, gap-4 → gap-3 로 3-4px 절약) */}
      <header className="flex items-center gap-3 border-b border-neutral-100 bg-white px-4 py-2">
        <Brand />
        <NlSearchBar />
      </header>

      {/* 스마트 칩 (거래유형 + 핵심 필터) */}
      <SmartChips />

      {/* 활성 필터 pills */}
      <ActiveFilterPills />

      {/* 본문: 좌 리스트 / 우 지도
          L-ux1 (2026-04-22): grid-cols 반응형 — 좁은 창 대응.
          L-ux2 (2026-04-22): listPanelCollapsed 때 28px 레일로 축소 — 토글 버튼으로 복구.
          내부 grid-cols 는 minmax(0,1fr) — 1fr 트랙이 자식 min-content 에
          눌려 커지는 걸 차단. */}
      <div
        className={[
          'grid h-full min-h-0 overflow-hidden',
          listPanelCollapsed
            ? 'grid-cols-[28px_minmax(0,1fr)]'
            : 'grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]',
        ].join(' ')}
      >
        {listPanelCollapsed ? (
          <button
            onClick={toggleListPanel}
            aria-label={`매물 리스트 펼치기 (${listingsCount}개)`}
            className="group flex h-full flex-col items-center gap-2 border-r border-neutral-200 bg-white py-3 transition hover:bg-neutral-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 group-hover:text-neutral-900"><path d="M9 18l6-6-6-6"/></svg>
            <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold tabular-nums text-neutral-700">
              {listingsCount}개 매물
            </span>
          </button>
        ) : (
          <div className="relative">
            <ListPanel />
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
          {/* L-mapfix6b: MapLibre 가 .maplibregl-map 에 position:relative 를 주입해
              Tailwind `absolute` 를 덮으면 inset-0 이 무효화돼 높이가 0 으로 접힘.
              인라인 style 로 100% fill 을 강제해 어떤 position 에서도 안전. */}
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ width: '100%', height: '100%' }}
          />
          <SemanticZoomIndicator />
          <MapControls />
          <HeroPinLayer />
          <MiniCard />
        </div>
      </div>
    </div>
  );
}


// L-ux1 (2026-04-22): 좁은 창에서 브랜드 영역 축소 —
//   md 이하: W 로고만
//   md~lg: WISHES wordmark 까지
//   lg 이상: MAP 2026 배지까지 전체 노출
function Brand() {
  return (
    <a href="/" aria-label="WISHES 홈" className="flex shrink-0 items-center gap-2">
      <div className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-[14px] font-extrabold text-white">
        W
      </div>
      <div className="hidden items-baseline gap-1.5 md:flex">
        <span className="text-[16px] font-bold tracking-tight text-neutral-900">
          WISHES
        </span>
        <span className="hidden rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 px-1.5 py-0.5 text-[9.5px] font-bold text-white lg:inline">
          MAP 2026
        </span>
      </div>
    </a>
  );
}
