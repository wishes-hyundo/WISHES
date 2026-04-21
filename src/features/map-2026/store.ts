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
  residence:     { label: '주거',        emoji: '🏠', accent: 'bg-emerald-600', accentLight: 'bg-emerald-50', ring: 'ring-emerald-500', text: 'text-emerald-700' },
  retail_office: { label: '상가/사무실', emoji: '🏢', accent: 'bg-amber-600',   accentLight: 'bg-amber-50',   ring: 'ring-amber-500',   text: 'text-amber-700'   },
  land:          { label: '토지',        emoji: '🌾', accent: 'bg-lime-600',    accentLight: 'bg-lime-50',    ring: 'ring-lime-500',    text: 'text-lime-700'    },
  investment:    { label: '투자',        emoji: '💰', accent: 'bg-violet-600',  accentLight: 'bg-violet-50',  ring: 'ring-violet-500',  text: 'text-violet-700'  },
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
  map: MapLibreMap | null;
  overlay: MapboxOverlay | null;
  setMap: (m: MapLibreMap, o: MapboxOverlay) => void;

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
