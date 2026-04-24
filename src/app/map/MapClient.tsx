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

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { useMap2026Store, type MapListing, type PropertyCategory } from '@/features/map-2026/store';
import { useViewport } from '@/features/map-2026/hooks/useViewport';
import { useSemanticZoom } from '@/features/map-2026/hooks/useSemanticZoom';
import { useHeroRanking } from '@/features/map-2026/hooks/useHeroRanking';
import { useFilterUrlSync } from '@/features/map-2026/hooks/useFilterUrlSync';

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

import KakaoDeckOverlay, { type MapItem } from '@/components/map/KakaoDeckOverlay';
// L-mapmarker1 (2026-04-23): 네이버·직방 스타일 HTML 마커 (Kakao CustomOverlay).
//   KakaoDeckOverlay 의 item scatter 는 items=[] 로 비활성화 (cluster 레이어는 유지).
import HtmlMarkerOverlay from '@/features/map-2026/components/HtmlMarkerOverlay';
// L-adminpoly1 (2026-04-24 pm): 축소 뷰 시/도 폴리곤 하이라이트
import AdminRegionOverlay from '@/features/map-2026/components/AdminRegionOverlay';
// L-worldclass1 (2026-04-24 pm): 서버 사전집계 클러스터 훅
import { useMapClusters } from '@/features/map-2026/hooks/useMapClusters';

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
  // L-worldclass1: Kakao level 추적 → useMapClusters 에 전달
  const [kakaoLevel, setKakaoLevel] = useState<number>(5);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<string>('');

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
  // L-clusterexact1 (2026-04-24 pm): 클러스터 필터 state + setter
  const clusterFilterIds = useMap2026Store((s) => s.clusterFilterIds);
  const setClusterFilter = useMap2026Store((s) => s.setClusterFilter);

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
          setKakaoLevel(map.getLevel());  // L-worldclass1: useMapClusters 에 전달
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

  // L-v7-url (2026-04-22): URL ↔ FilterState 양방향 동기화. 페이지 진입 시
  //   1회 수화 → 이후 filter/sort/nlQuery 변경 시 replaceState 반영. v7 §5.
  useFilterUrlSync();

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
      <header className="flex items-center gap-3 border-b border-neutral-100 bg-white px-4 py-2">
        <Brand />
        <NlSearchBar />
        <TopRightActions />
      </header>

      <CategoryTabs />
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
          <div className="relative flex min-h-0 flex-col">
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
            style={{ width: '100%', height: '100%' }}
          />
          {ready && kakaoMap ? (
            <>
              <KakaoDeckOverlay
                map={kakaoMap}
                // L-map3 (2026-04-22): Kakao Maps SDK v2 Map 인스턴스는 getContainer()
                //   를 노출하지 않아서, 이전에는 오버레이 useEffect 가 early-return 하며
                //   canvas 를 만들지 못했다. 상위가 동일 element ref 를 직접 내려준다.
                container={containerRef.current}
                // L-mapmarker1 (2026-04-23): 개별 매물 렌더링은 HtmlMarkerOverlay 가
                //   담당 (네이버·직방 스타일 HTML 마커). deck.gl item scatter/text 를
                //   비활성화하기 위해 items=[] 로 비워둠. cluster 레이어는 유지.
                items={[]}
                onClickListing={onClickListing}
              />
              {/* L-worldclass1 (2026-04-24 pm) + L-adminfit2 (2026-04-24 pm):
                  useMapClusters 결과를 HtmlMarkerOverlay 와 AdminRegionOverlay
                  양쪽에 공유하여 축소 뷰에서도 시/도 폴리곤 count 계산 가능. */}
              <MapOverlaysWithClusters
                kakaoMap={kakaoMap}
                kakaoLevel={kakaoLevel}
                listings={listings}
                selectedListingId={detailListingId}
                category={filterCategory}
                onClickListing={onClickListing}
                onClusterFilter={setClusterFilter}
                clusterFilterIds={clusterFilterIds}
              />
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
  if (user) {
    const name =
      (user.user_metadata as { full_name?: string } | undefined)?.full_name ||
      user.email?.split('@')[0] ||
      '회원';
    return (
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <Link
          href="/contact"
          className="inline-flex items-center rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          매물내놓기
        </Link>
        <span className="hidden text-[12.5px] text-neutral-700 sm:inline">
          {name}님
        </span>
        <button
          onClick={signOut}
          className="px-2 py-1 text-[12px] text-neutral-500 hover:text-neutral-900"
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
        className="inline-flex items-center rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700"
      >
        매물내놓기
      </Link>
      <button
        onClick={() => setShowAuthModal(true)}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-neutral-700 hover:bg-neutral-100"
      >
        <LogIn className="size-3.5" />
        <span className="hidden sm:inline">로그인/회원가입</span>
        <span className="sm:hidden">로그인</span>
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-worldclass1 (2026-04-24 pm) + L-adminfit2 (2026-04-24 pm):
// useMapClusters 결과를 HtmlMarkerOverlay 와 AdminRegionOverlay 양쪽이
// 공유하는 wrapper. hook 호출은 map mount 이후에만 유효하므로 조건부 subtree
// 안에서 쓴다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MapOverlaysWithClusters(props: {
  kakaoMap: unknown;
  kakaoLevel: number;
  listings: MapListing[];
  selectedListingId: number | null;
  category: PropertyCategory;
  onClickListing: (id: number) => void;
  onClusterFilter: (ids: number[] | null) => void;
  clusterFilterIds: number[] | null;
}) {
  const { clusters } = useMapClusters(props.kakaoLevel);
  return (
    <>
      <HtmlMarkerOverlay
        map={props.kakaoMap}
        listings={props.listings}
        selectedListingId={props.selectedListingId}
        category={props.category}
        onClickListing={props.onClickListing}
        serverClusters={clusters}
        onClusterFilter={props.onClusterFilter}
        clusterFilterIds={props.clusterFilterIds}
      />
      <AdminRegionOverlay
        map={props.kakaoMap}
        listings={props.listings}
        serverClusters={clusters}
      />
    </>
  );
}
