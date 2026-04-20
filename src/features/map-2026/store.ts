// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Map 2026 · Zustand store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';

// DB에 정렬 — '매매'|'전세'|'월세'|'단기'
export type DealType = '매매' | '전세' | '월세' | '단기';
export type ZoomMode = 'hexagon-low' | 'hexagon-mid' | 'pins' | '3d';

// Viewport RPC 로부터 받는 뷰 모델 (리스트/핀/카드에서 공유)
export interface MapListing {
  id: number;
  lat: number;
  lng: number;
  deal: DealType;
  type: string | null;                 // '원룸' | '투룸' 등
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  area_m2: number | null;
  rooms: number | null;
  floor_current: string | null;
  station_distance: number | null;     // 미터
  built_year: string | null;
  building_name: string | null;
  dong: string | null;
  title: string | null;
  thumbnail_url: string | null;
  features: string[];
  photo_count: number;
  median_price: number | null;         // 동·거래유형 중앙값
  median_deviation: number | null;     // ±% (−1 ~ +∞)
  hero_score: number;                  // 서버 0..100
  created_at: string;
  updated_at: string;
}

export interface BBox { west: number; south: number; east: number; north: number }

// 서버로 보낼 필터 모음
export interface FilterState {
  deals: DealType[];                   // ['전세', '월세'] 처럼 누적 가능
  minPrice: number | null;             // 만원 단위
  maxPrice: number | null;             // 만원 단위
  minDeposit: number | null;
  maxDeposit: number | null;
  minMonthly: number | null;
  maxMonthly: number | null;
  rooms: number[];                     // [1, 2, 3, 4+]   (4=4룸 이상)
  minArea: number | null;              // m²
  maxArea: number | null;
  nearStation: number | null;          // 초(sec) 도보 — 5분=300초
  newBuildYears: number | null;        // 신축 기준 (3=3년 이내)
  propertyTypes: string[];             // ['원룸', '투룸', '오피스텔']
  features: string[];                  // ['주차', '엘리베이터', '반려동물']
  hasImages: boolean;                  // 사진 있는 매물만
}

export const DEFAULT_FILTER: FilterState = {
  deals: [],
  minPrice: null, maxPrice: null,
  minDeposit: null, maxDeposit: null,
  minMonthly: null, maxMonthly: null,
  rooms: [],
  minArea: null, maxArea: null,
  nearStation: null,
  newBuildYears: null,
  propertyTypes: [],
  features: [],
  hasImages: false,
};

export type SortKey = 'recent' | 'price_asc' | 'price_desc' | 'area_desc' | 'deal_score';

export interface Map2026Store {
  // MapLibre + deck.gl
  map: MapLibreMap | null;
  overlay: MapboxOverlay | null;
  setMap: (m: MapLibreMap, o: MapboxOverlay) => void;

  // 뷰포트
  zoom: number;
  mode: ZoomMode;
  bbox: BBox | null;
  setBbox: (bbox: BBox) => void;
  setZoom: (z: number) => void;
  setMode: (m: ZoomMode) => void;

  // 필터 + 정렬
  filter: FilterState;
  setFilter: (patch: Partial<FilterState>) => void;
  toggleDeal: (d: DealType) => void;
  toggleRoom: (n: number) => void;
  togglePropertyType: (t: string) => void;
  toggleFeature: (f: string) => void;
  clearFilter: () => void;

  sort: SortKey;
  setSort: (s: SortKey) => void;

  // 데이터
  listings: MapListing[];
  setListings: (l: MapListing[]) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;

  heroes: MapListing[];
  setHeroes: (h: MapListing[]) => void;

  // 선택/호버
  selectedId: number | null;
  selectListing: (id: number | null, flyTo?: boolean) => void;

  hoveredListing: MapListing | null;
  hoverPos: { x: number; y: number } | null;
  setHover: (l: MapListing | null, x?: number, y?: number) => void;

  // 레이어 토글
  isochrone: boolean;
  heatmap: boolean;
  threeD: boolean;
  similar: boolean;
  toggleLayer: (key: 'isochrone' | 'heatmap' | 'threeD' | 'similar') => void;

  // NL 검색
  nlQuery: string;
  setNlQuery: (q: string) => void;
}

export const useMap2026Store = create<Map2026Store>()(
  subscribeWithSelector((set, get) => ({
    map: null,
    overlay: null,
    setMap: (map, overlay) => set({ map, overlay }),

    zoom: 12.3,
    mode: 'pins',
    bbox: null,
    setBbox: (bbox) => set({ bbox }),
    setZoom: (zoom) => set({ zoom }),
    setMode: (mode) => set({ mode }),

    filter: { ...DEFAULT_FILTER },
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
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
          map.flyTo({
            center: [l.lng, l.lat],
            zoom: Math.max(map.getZoom(), 14),
            duration: 900,
            curve: 1.6,
          });
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

    nlQuery: '',
    setNlQuery: (q) => set({ nlQuery: q }),
  }))
);
