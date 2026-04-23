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
  floor_current: string | null;
  station_distance: number | null;
  built_year: string | null;
  building_name: string | null;
  dong: string | null;
  title: string | null;
  thumbnail_url: string | null;
  features: string[];
  photo_count: number;
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
                map.panTo(new kakao.maps.LatLng(l.lat, l.lng));
                const curLevel = map.getLevel ? map.getLevel() : 4;
                map.setLevel(Math.min(curLevel, 3)); // 가까이
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
    listPanelCollapsed: (() => {
      if (typeof window === 'undefined') return false;
      try { return window.localStorage.getItem('map2026.listPanel') === 'collapsed'; }
      catch { return false; }
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
    filterModalOpen: false,
    openFilterModal: () => set({ filterModalOpen: true }),
    closeFilterModal: () => set({ filterModalOpen: false }),
  }))
);
