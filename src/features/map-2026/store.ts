// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Map 2026 · Zustand store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
// L-kakao1 (2026-04-22): /map 이 Kakao SDK 베이스로 전환됨에 따라 map instance
//   타입을 generic Kakao/MapLibre 공용으로 넓힘. 런타임 메서드 존재 여부로
//   dispatch — 강한 타입은 adapter 레벨에서만 사용.
type KakaoLatLng = unknown;
type KakaoMapLike = {
  panTo?: (latlng: KakaoLatLng) => void;
  setCenter?: (latlng: KakaoLatLng) => void;
  setLevel?: (level: number) => void;
  getLevel?: () => number;
  flyTo?: (opts: { center: [number, number]; zoom?: number; duration?: number; curve?: number }) => void;
  getZoom?: () => number;
};
export type MapInstance = KakaoMapLike & Record<string, unknown>;

// DB에 정렬 — '매매'|'전세'|'월세'|'단기'
export type DealType = '매매' | '전세' | '월세' | '단기';
export type ZoomMode = 'hexagon-low' | 'hexagon-mid' | 'pins' | '3d';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 종합부동산 카테고리 체계 (2026-04 Category-First 개편)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type PropertyCategory =
  | 'residence'       // 🏠 주거
  | 'retail_office'   // 🏢 상가/사무실
  | 'land'            // 🌾 토지
  | 'investment';     // 💰 투자

export type CommercialPurpose =
  | 'retail'
  | 'office'
  | 'knowledge_center'
  | 'coworking'
  | 'mixed_use';

export const CATEGORY_THEME: Record<PropertyCategory, {
  label: string;
  emoji: string;
  accent: string;
  accentLight: string;
  ring: string;
  text: string;
}> = {
  // L-a11y5 (2026-04-21): accent -600 → -700 상향.
  //   카테고리 카운트 배지(10.5px bold white) 대비 AA 미달:
  //     emerald-600 3.76:1 → emerald-700 5.30:1 ✓
  //     amber-600   2.92:1 → amber-700   4.67:1 ✓
  //     lime-600    3.03:1 → lime-700    5.08:1 ✓
  //     violet-600  5.72:1 (이미 통과) → violet-700 7.44:1 (일관성 상향)
  residence:     { label: '주거',        emoji: '🏠', accent: 'bg-emerald-700', accentLight: 'bg-emerald-50', ring: 'ring-emerald-500', text: 'text-emerald-700' },
  retail_office: { label: '상가/사무실', emoji: '🏢', accent: 'bg-amber-700',   accentLight: 'bg-amber-50',   ring: 'ring-amber-500',   text: 'text-amber-700'   },
  land:          { label: '토지',        emoji: '🌾', accent: 'bg-lime-700',    accentLight: 'bg-lime-50',    ring: 'ring-lime-500',    text: 'text-lime-700'    },
  investment:    { label: '투자',        emoji: '💰', accent: 'bg-violet-700',  accentLight: 'bg-violet-50',  ring: 'ring-violet-500',  text: 'text-violet-700'  },
};

export const COMMERCIAL_PURPOSE_LABEL: Record<CommercialPurpose, { label: string; emoji: string }> = {
  retail:           { label: '상가',         emoji: '🛍️' },
  office:           { label: '사무실',       emoji: '💼' },
  knowledge_center: { label: '지식산업센터', emoji: '🏭' },
  coworking:        { label: '공유오피스',   emoji: '🤝' },
  mixed_use:        { label: '복합건물',     emoji: '🏬' },
};

// Viewport RPC 로부터 받는 뷰 모델
// L-card3 (2026-04-23 p.m.): v3 카드 + 슬라이드 패널용 필드 확장
export interface MapListing {
  id: number;
  lat: number;
  lng: number;
  deal: DealType;
  type: string | null;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  area_m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor_current: string | null;
  floor_total: string | null;
  direction: string | null;
  station_distance: number | null;
  built_year: string | null;
  building_name: string | null;
  dong: string | null;
  address: string | null;
  title: string | null;
  ai_title: string | null;
  thumbnail_url: string | null;
  features: string[];
  photo_count: number;
  parking: string | null;
  pet: boolean | null;
  elevator: boolean | null;
  full_option: boolean | null;
  maintenance_fee: number | null;
  business_type: string | null;
  has_video: boolean;
  median_price: number | null;
  median_deviation: number | null;
  hero_score: number;
  created_at: string;
  updated_at: string;
}

export interface BBox { west: number; south: number; east: number; north: number }

export interface FilterState {
  category: PropertyCategory;
  purposes: CommercialPurpose[];
  deals: DealType[];
  hasImages: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  minDeposit: number | null;
  maxDeposit: number | null;
  minMonthly: number | null;
  maxMonthly: number | null;
  minArea: number | null;
  maxArea: number | null;
  rooms: number[];
  newBuildYears: number | null;
  propertyTypes: string[];
  nearStation: number | null;
  features: string[];
}

export const DEFAULT_FILTER: FilterState = {
  category: 'residence',
  purposes: [],
  deals: [],
  hasImages: false,
  minPrice: null, maxPrice: null,
  minDeposit: null, maxDeposit: null,
  minMonthly: null, maxMonthly: null,
  minArea: null, maxArea: null,
  rooms: [],
  newBuildYears: null,
  propertyTypes: [],
  nearStation: null,
  features: [],
};

export type SortKey = 'recent' | 'price_asc' | 'price_desc' | 'area_desc' | 'deal_score';

export interface Map2026Store {
  map: MapInstance | null;
  overlay: unknown | null;
  setMap: (m: MapInstance, o?: unknown) => void;

  // L-naver-2026skel2 (2026-04-26): GeoJSON 로딩 상태 — MapLoadingIndicator 표시.
  geoLoading: boolean;
  setGeoLoading: (loading: boolean) => void;

  zoom: number;
  mode: ZoomMode;
  bbox: BBox | null;
  setBbox: (bbox: BBox) => void;
  setZoom: (z: number) => void;
  setMode: (m: ZoomMode) => void;

  filter: FilterState;
  setFilter: (patch: Partial<FilterState>) => void;
  setCategory: (c: PropertyCategory) => void;
  togglePurpose: (p: CommercialPurpose) => void;
  toggleDeal: (d: DealType) => void;
  toggleRoom: (n: number) => void;
  togglePropertyType: (t: string) => void;
  toggleFeature: (f: string) => void;
  clearFilter: () => void;

  sort: SortKey;
  setSort: (s: SortKey) => void;

  listings: MapListing[];
  setListings: (l: MapListing[]) => void;
  // L-catcount1 (2026-04-23 p.m.): 4개 카테고리별 카운트 (뷰포트 + 필터 기준)
  categoryCounts: Record<PropertyCategory, number> | null;
  setCategoryCounts: (c: Record<PropertyCategory, number> | null) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;

  heroes: MapListing[];
  setHeroes: (h: MapListing[]) => void;

  selectedId: number | null;
  selectListing: (id: number | null, flyTo?: boolean) => void;

  hoveredListing: MapListing | null;
  hoverPos: { x: number; y: number } | null;
  setHover: (l: MapListing | null, x?: number, y?: number) => void;

  isochrone: boolean;
  heatmap: boolean;
  threeD: boolean;
  similar: boolean;
  toggleLayer: (key: 'isochrone' | 'heatmap' | 'threeD' | 'similar') => void;

  // L-naver-2026poi1 (2026-04-27): 학세권/인근시설 토글 (학교/병원/지하철/은행/마트/편의점)
  poi: {
    school: boolean; hospital: boolean; subway: boolean;
    bank: boolean; mart: boolean; cvs: boolean;
  };
  togglePoi: (key: 'school' | 'hospital' | 'subway' | 'bank' | 'mart' | 'cvs') => void;

  // Phase D — 통근 등고선 상태 (중심점/분/페이로드)
  isochroneCenter: [number, number] | null;
  isochroneMinutes: number;
  isochronePayload: {
    center: [number, number];
    minutes: number;
    polygons: import('geojson').Feature<import('geojson').Polygon>[];
  } | null;
  setIsochroneCenter: (c: [number, number] | null) => void;
  setIsochroneMinutes: (m: number) => void;
  setIsochronePayload: (p: Map2026Store['isochronePayload']) => void;

  nlQuery: string;
  setNlQuery: (q: string) => void;

  // L-ux2 (2026-04-22): 좁은 뷰포트(DevTools 도킹/Claude 사이드바)에서
  //   ListPanel 을 접어 지도 캔버스에 공간을 양보하는 토글.
  //   기본 false, 토글 시 localStorage 영속화 (세션 간 유지).
  listPanelCollapsed: boolean;
  toggleListPanel: () => void;

  // L-v7-1 (2026-04-22): v7 §6 12 추가필터 아코디언 열림 상태 기억
  //   id 는 필터 섹션 슬러그 ('parking', 'elevator', 'features' 등).
  //   localStorage key: 'map2026.accordion' (JSON).
  accordionOpen: Record<string, boolean>;
  toggleAccordion: (id: string) => void;
  setAccordion: (id: string, open: boolean) => void;

  // L-v7-2 (2026-04-22): v7 §4 scope 전파 (중개인 전용)
  //   '내 매물'(mine) vs '전체'(all). /map 에선 보통 all, /admin/search
  //   에선 mine. URL 공유 시 scope 플래그 유지.
  scope: 'all' | 'mine';
  setScope: (s: 'all' | 'mine') => void;

  // L-v7-3 (2026-04-22): v7 §6 "+더보기" 접힘 상태 (SumBox)
  //   5개 초과 요약 시 5개만 표시. 토글로 전체 노출.
  sumBoxExpanded: boolean;
  toggleSumBoxExpanded: () => void;

  // L-v7-4 (2026-04-22): v7 §9 선결조건 노트 dismiss 상태
  //   관리자 페이지 상단에 표시되는 선결조건 배지. 사용자가 ✕ 클릭 시
  //   localStorage 에 저장되어 24h 동안 숨김.
  precondDismissedAt: number | null;
  dismissPrecond: () => void;

  // L-mapfilter3 (2026-04-23): Gate 패턴 — 기본 상태는 카테고리 탭만 노출,
  //   사용자가 카테고리 탭을 클릭하면 해당 카테고리 전용 필터 모달이 열림.
  //   필터를 항상 띄워두던 이전 방식은 화면이 꽉 차고 "사용하기 너무 불편"
  //   이라는 피드백 → on-demand 모달로 전환.
  filterModalOpen: boolean;
  openFilterModal: () => void;
  closeFilterModal: () => void;

  // L-mapmodal1 (2026-04-23): 매물 상세 모달 — 핀/리스트 카드 클릭 시 오픈.
  //   선택(selectedId) 은 하이라이트/flyTo 용으로 이미 있었지만 "페이지
  //   모달도 안나오고" 피드백대로 실제로 매물 정보를 보여주는 UI 가 없었다.
  //   openListingDetail 은 selectListing(id, true) + detailListingId 세팅을
  //   함께 수행해 "지도 포커스 + 모달 노출" 을 한 번에 처리.
  detailListingId: number | null;
  // L-detailcache1 (2026-04-23 p.m.): 뷰포트 재조회로 listings 가 갱신되어도
  //   선택된 매물 정보가 사라지지 않도록 객체 자체를 별도 캐싱.
  //   모바일에서 매물 클릭 시 패널이 잠깐 떴다 초기화되던 버그 수정.
  detailListing: MapListing | null;
  openListingDetail: (id: number) => void;
  closeListingDetail: () => void;

  // L-clusterexact1 + L-clusterexact3 (2026-04-24 pm): 클러스터 마커 클릭 시
  //   "정확히 N개 매물만" 사이드바와 지도에 남기는 필터.
  //   · clusterFilterIds: 필터할 매물 id 배열 (null = 필터 해제)
  //   · clusterFilterListings: /api/listings/by-ids 로 fetch 한 전체 매물 객체.
  //     useViewport limit 4000 로 일부 id 가 listings 에서 누락될 수 있으므로
  //     별도 로 fetch 해서 100% 정확한 N개 표시.
  clusterFilterIds: number[] | null;
  clusterFilterListings: MapListing[] | null;
  // L-complexlabel1 (2026-04-26): 단지명 (또는 동 이름) 라벨 — 사이드바 헤더에 표시.
  //   네이버 스타일: 마커 클릭 시 "잠원동양타운 (5)" 같은 헤더 + 매물 카드.
  clusterFilterLabel: string | null;
  setClusterFilter: (ids: number[] | null, label?: string | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// LocalStorage safe helpers (SSR guard 포함)
// ─────────────────────────────────────────────────────────────────────────
function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* noop */ }
}
function readAccordion(): Record<string, boolean> {
  const raw = lsGet('map2026.accordion');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'boolean') out[k] = v;
      }
      return out;
    }
  } catch { /* noop */ }
  return {};
}
function readPrecondDismissed(): number | null {
  const raw = lsGet('map2026.precondDismissedAt');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export const useMap2026Store = create<Map2026Store>()(
  subscribeWithSelector((set, get) => ({
    map: null,
    overlay: null,
    setMap: (map, overlay = null) => set({ map, overlay }),

    geoLoading: false,
    setGeoLoading: (geoLoading) => set({ geoLoading }),

    zoom: 12.3,
    mode: 'pins',
    bbox: null,
    setBbox: (bbox) => set({ bbox }),
    setZoom: (zoom) => set({ zoom }),
    setMode: (mode) => set({ mode }),

    filter: { ...DEFAULT_FILTER },
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),

    setCategory: (category) =>
      set((s) => {
        const next: FilterState = { ...s.filter, category };
        if (category !== 'residence') {
          next.rooms = [];
          next.newBuildYears = null;
          next.propertyTypes = [];
          next.features = next.features.filter((f) => f !== '반려동물');
        }
        if (category !== 'retail_office') {
          next.purposes = [];
        }
        return { filter: next };
      }),

    togglePurpose: (p) =>
      set((s) => ({
        filter: {
          ...s.filter,
          purposes: s.filter.purposes.includes(p)
            ? s.filter.purposes.filter((x) => x !== p)
            : [...s.filter.purposes, p],
        },
      })),

    toggleDeal: (d) =>
      set((s) => ({
        filter: {
          ...s.filter,
          deals: s.filter.deals.includes(d)
            ? s.filter.deals.filter((x) => x !== d)
            : [...s.filter.deals, d],
        },
      })),
    toggleRoom: (n) =>
      set((s) => ({
        filter: {
          ...s.filter,
          rooms: s.filter.rooms.includes(n)
            ? s.filter.rooms.filter((x) => x !== n)
            : [...s.filter.rooms, n],
        },
      })),
    togglePropertyType: (t) =>
      set((s) => ({
        filter: {
          ...s.filter,
          propertyTypes: s.filter.propertyTypes.includes(t)
            ? s.filter.propertyTypes.filter((x) => x !== t)
            : [...s.filter.propertyTypes, t],
        },
      })),
    toggleFeature: (f) =>
      set((s) => ({
        filter: {
          ...s.filter,
          features: s.filter.features.includes(f)
            ? s.filter.features.filter((x) => x !== f)
            : [...s.filter.features, f],
        },
      })),
    clearFilter: () => set({ filter: { ...DEFAULT_FILTER } }),

    sort: 'recent',
    setSort: (sort) => set({ sort }),

    listings: [],
    setListings: (listings) => set({ listings }),
    categoryCounts: null,
    setCategoryCounts: (categoryCounts) => set({ categoryCounts }),
    loading: false,
    setLoading: (loading) => set({ loading }),

    heroes: [],
    setHeroes: (heroes) => set({ heroes }),

    selectedId: null,
    selectListing: (id, flyTo) => {
      set({ selectedId: id });
      if (flyTo && id != null) {
        const l = get().listings.find((x) => x.id === id);
        const map = get().map;
        if (l && map) {
          // L-kakao1 (2026-04-22): Kakao / MapLibre 양쪽 지원 — 런타임 메서드로 분기
          if (typeof map.panTo === 'function' && typeof map.setLevel === 'function') {
            try {
              const kakao = (window as unknown as { kakao?: { maps: { LatLng: new (lat: number, lng: number) => unknown } } }).kakao;
              if (kakao) {
                // L-detailcache1 (2026-04-23 p.m.): setLevel 제거.
                //   이전 setLevel(Math.min(curLevel, 3)) 은 모바일에서 과도 줌 →
                //   idle 이벤트 → 뷰포트 재조회 → listings 초기화 → 상세 패널 증발
                //   사이클을 유발. panTo 만으로 충분 (중앙 정렬 목적).
                map.panTo(new kakao.maps.LatLng(l.lat, l.lng));
              }
            } catch { /* noop */ }
          } else if (typeof map.flyTo === 'function') {
            map.flyTo({
              center: [l.lng, l.lat],
              zoom: Math.max(typeof map.getZoom === 'function' ? map.getZoom() : 12, 14),
              duration: 900,
              curve: 1.6,
            });
          }
        }
      }
    },

    hoveredListing: null,
    hoverPos: null,
    setHover: (l, x, y) =>
      set({
        hoveredListing: l,
        hoverPos: l && x !== undefined && y !== undefined ? { x, y } : null,
      }),

    isochrone: false,
    heatmap: false,
    threeD: false,
    similar: false,
    toggleLayer: (key) => set((s) => ({ [key]: !s[key] } as Partial<Map2026Store>)),

    // L-naver-2026poi1: 학세권/인근시설 기본 모두 OFF
    poi: { school: false, hospital: false, subway: false, bank: false, mart: false, cvs: false },
    togglePoi: (key) => set((s) => ({ poi: { ...s.poi, [key]: !s.poi[key] } })),

    // Phase D — 등고선 상태 (기본: 15분, 중심점 아직 없음)
    isochroneCenter: null,
    isochroneMinutes: 15,
    isochronePayload: null,
    setIsochroneCenter: (isochroneCenter) => set({ isochroneCenter }),
    setIsochroneMinutes: (isochroneMinutes) => set({ isochroneMinutes }),
    setIsochronePayload: (isochronePayload) => set({ isochronePayload }),

    nlQuery: '',
    setNlQuery: (q) => set({ nlQuery: q }),

    // L-ux2: ListPanel collapse (localStorage 영속)
    // L-naver-2026mobile1 (2026-04-27): 모바일 첫 진입 시 자동 collapsed (지도 영역 확보).
    //   사용자 명시 저장값 우선 → 없으면 width < 768px 일 때 collapsed 기본.
    listPanelCollapsed: (() => {
      if (typeof window === 'undefined') return false;
      try {
        const saved = window.localStorage.getItem('map2026.listPanel');
        if (saved === 'collapsed') return true;
        if (saved === 'open' || saved === 'expanded') return false;
        // 저장값 없음 → 모바일이면 collapsed (지도 영역 우선)
        return window.innerWidth < 768;
      } catch { return false; }
    })(),
    toggleListPanel: () =>
      set((s) => {
        const next = !s.listPanelCollapsed;
        lsSet('map2026.listPanel', next ? 'collapsed' : 'open');
        return { listPanelCollapsed: next };
      }),

    // L-v7-1: accordion 열림 상태 (localStorage 영속)
    accordionOpen: readAccordion(),
    toggleAccordion: (id) =>
      set((s) => {
        const next = { ...s.accordionOpen, [id]: !s.accordionOpen[id] };
        lsSet('map2026.accordion', JSON.stringify(next));
        return { accordionOpen: next };
      }),
    setAccordion: (id, open) =>
      set((s) => {
        const next = { ...s.accordionOpen, [id]: open };
        lsSet('map2026.accordion', JSON.stringify(next));
        return { accordionOpen: next };
      }),

    // L-v7-2: scope 전파
    scope: 'all',
    setScope: (scope) => set({ scope }),

    // L-v7-3: SumBox 펼침
    sumBoxExpanded: false,
    toggleSumBoxExpanded: () => set((s) => ({ sumBoxExpanded: !s.sumBoxExpanded })),

    // L-v7-4: 선결조건 dismiss (24h)
    precondDismissedAt: readPrecondDismissed(),
    dismissPrecond: () => {
      const now = Date.now();
      lsSet('map2026.precondDismissedAt', String(now));
      set({ precondDismissedAt: now });
    },

    // L-mapfilter3: Gate 패턴 필터 모달
    // L-panelexclusive1 (2026-04-23 p.m.): 필터 ↔ 매물상세 배타적 제어
    //   두 패널이 같은 위치에 겹쳐 보이던 문제 해결.
    filterModalOpen: false,
    openFilterModal: () => set({
      filterModalOpen: true,
      detailListingId: null,
      detailListing: null,
    }),
    closeFilterModal: () => set({ filterModalOpen: false }),

    // L-clusterexact1 + L-clusterexact3 (2026-04-24 pm) + L-complexlabel1 (2026-04-26): 클러스터 필터
    clusterFilterIds: null,
    clusterFilterListings: null,
    clusterFilterLabel: null,
    setClusterFilter: (ids, label = null) => {
      if (!ids || ids.length === 0) {
        set({ clusterFilterIds: null, clusterFilterListings: null, clusterFilterLabel: null });
        return;
      }
      // 동일한 id 세트로 중복 호출되면 skip (연속 클릭 방지)
      const prev = get().clusterFilterIds;
      if (prev && prev.length === ids.length && prev.every((v, i) => v === ids[i])) return;
      // ids 먼저 저장 → ListPanel/HtmlMarker 즉시 필터 반영 (listings 교집합)
      set({ clusterFilterIds: ids, clusterFilterListings: null, clusterFilterLabel: label });
      // L-clusterexact3: by-ids 로 정확한 매물 객체 hydrate (viewport limit 회피).
      //   응답 도착 시점에 여전히 같은 필터 상태일 때만 반영 (race condition 방지).
      (async () => {
        try {
          const qs = ids.join(',');
          const res = await fetch(`/api/listings/by-ids?ids=${qs}`);
          if (!res.ok) return;
          const json = await res.json();
          const arr: MapListing[] = Array.isArray(json?.listings) ? json.listings : [];
          if (arr.length === 0) return;
          const cur = get().clusterFilterIds;
          if (!cur || cur.length !== ids.length || !cur.every((v, i) => v === ids[i])) return;
          set({ clusterFilterListings: arr });
        } catch { /* 무시 — 기존 listings 교집합으로 대체 표시 */ }
      })();
    },

    // L-mapmodal1 (2026-04-23): 매물 상세 모달
    detailListingId: null,
    detailListing: null,
    openListingDetail: (id) => {
      // L-detailcache1 (2026-04-23 p.m.): 클릭 시점의 매물 객체 캐싱 — 뷰포트
      //   재조회로 listings 가 바뀌어도 패널 내용 유지됨. 모바일 초기화 버그 수정.
      // L-panelexclusive1 (2026-04-23 p.m.): 필터 패널이 열려 있었다면 닫기
      const cached = get().listings.find((l) => l.id === id) ?? null;
      get().selectListing(id, true);
      set({
        detailListingId: id,
        detailListing: cached,
        filterModalOpen: false,
      });
    },
    closeListingDetail: () => set({ detailListingId: null, detailListing: null }),
  }))
);
