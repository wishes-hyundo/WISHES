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

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { useMap2026Store } from '@/features/map-2026/store';
import { useViewport } from '@/features/map-2026/hooks/useViewport';
import { useSemanticZoom } from '@/features/map-2026/hooks/useSemanticZoom';
import { useHeroRanking } from '@/features/map-2026/hooks/useHeroRanking';

import { NlSearchBar } from '@/features/map-2026/components/NlSearchBar';
import { SmartChips } from '@/features/map-2026/components/SmartChips';
import { ActiveFilterPills } from '@/features/map-2026/components/ActiveFilterPills';
import { ListPanel } from '@/features/map-2026/components/ListPanel';
import { MapControls } from '@/features/map-2026/components/MapControls';
import { SemanticZoomIndicator } from '@/features/map-2026/components/SemanticZoomIndicator';
import { MiniCard } from '@/features/map-2026/components/MiniCard';

import KakaoDeckOverlay, { type MapItem } from '@/components/map/KakaoDeckOverlay';

// 서울 기본 중심
const SEOUL = { lat: 37.4979, lng: 127.0276 };

// Kakao level(1~14) ↔ 내부 zoom(5~17) 근사 매핑
//   level 1 → zoom 17 (건물), level 5 → zoom 13 (동), level 8 → zoom 10 (구)
//   semantic zoom 경계(11.5 / 13.5) 와 호환되도록 `zoom = 18 - level` 선택.
function levelToZoom(level: number): number {
  return Math.max(0, 18 - level);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<unknown>(null);
  // L-map2 (2026-04-22): KakaoDeckOverlay 가 mount 되지 않던 경쟁조건 해결.
  //   useRef 값 변경은 리렌더를 유발하지 않아 {ready && kakaoMapRef.current}
  //   조건이 false 로 고정되는 경우가 있었다. state 로 미러링해서 마운트 보장.
  const [kakaoMap, setKakaoMap] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<string>('');

  const setMap = useMap2026Store((s) => s.setMap);
  const setBbox = useMap2026Store((s) => s.setBbox);
  const setZoom = useMap2026Store((s) => s.setZoom);
  const listings = useMap2026Store((s) => s.listings);
  const selectListing = useMap2026Store((s) => s.selectListing);
  const listPanelCollapsed = useMap2026Store((s) => s.listPanelCollapsed);
  const toggleListPanel = useMap2026Store((s) => s.toggleListPanel);
  const listingsCount = useMap2026Store((s) => s.listings.length);

  // Kakao 지도 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!key || key === '여기에_카카오_JavaScript_앱키_입력') {
      setFailReason('NEXT_PUBLIC_KAKAO_MAP_KEY 환경변수 미설정');
      setFailed(true);
      return;
    }
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
                opts: { center: unknown; level: number }
              ) => {
                getBounds: () => {
                  getSouthWest: () => { getLat: () => number; getLng: () => number };
                  getNorthEast: () => { getLat: () => number; getLng: () => number };
                };
                getLevel: () => number;
              };
              event: {
                addListener: (target: unknown, type: string, handler: () => void) => void;
              };
            };
          };
        }).kakao;

        const map = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng),
          level: 5,
        });
        mapInst = map;
        kakaoMapRef.current = map;
        setKakaoMap(map); // state 로도 반영 → 오버레이 조건부 마운트 트리거

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
        };

        idleListener = sync;
        kakao.maps.event.addListener(map, 'idle', sync);
        sync(); // 초기 1회 강제 호출 → RPC 트리거

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

  // listings → Deck 아이템 변환
  const items: MapItem[] = useMemo(
    () =>
      listings.map((l) => {
        const unified =
          l.deal === '매매'
            ? l.price
            : l.deal === '전세'
            ? l.deposit
            : l.monthly;
        return {
          id: l.id,
          lat: l.lat,
          lng: l.lng,
          price_unified: unified,
          type: l.type,
          deal: l.deal,
          thumb_url: l.thumbnail_url,
        };
      }),
    [listings]
  );

  const onClickListing = useCallback(
    (id: number) => {
      selectListing(id, true);
    },
    [selectListing]
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
    // 4-track grid — 헤더 / SmartChips / ActiveFilterPills / 본문(1fr)
    <div className="grid h-full grid-rows-[auto_auto_auto_minmax(0,1fr)]">
      <header className="flex items-center gap-3 border-b border-neutral-100 bg-white px-4 py-2">
        <Brand />
        <NlSearchBar />
      </header>

      <SmartChips />
      <ActiveFilterPills />

      <div
        className={[
          'grid h-full min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)]',
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
          {/* Kakao 지도 컨테이너 — 인라인 style 로 100% fill 보장 */}
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ width: '100%', height: '100%' }}
          />
          {ready && kakaoMap ? (
            <KakaoDeckOverlay
              map={kakaoMap}
              // L-map3 (2026-04-22): Kakao Maps SDK v2 Map 인스턴스는 getContainer()
              //   를 노출하지 않아서, 이전에는 오버레이 useEffect 가 early-return 하며
              //   canvas 를 만들지 못했다. 상위가 동일 element ref 를 직접 내려준다.
              container={containerRef.current}
              items={items}
              onClickListing={onClickListing}
            />
          ) : null}
          <SemanticZoomIndicator />
          <MapControls />
          <MiniCard />
        </div>
      </div>
    </div>
  );
}

// 좁은 창에서 브랜드 영역 축소 — md 이하 W 로고, md+ wordmark, lg+ 배지
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
