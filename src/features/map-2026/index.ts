// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAP 2026 · 공개 API barrel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export { useMap2026Store, DEFAULT_FILTER } from './store';
export type {
  DealType,
  ZoomMode,
  MapListing,
  BBox,
  FilterState,
  SortKey,
  Map2026Store,
} from './store';

export { buildStyle } from './lib/mapStyle';
export { rankHeroes } from './lib/heroScore';
export { formatKRW, formatDealLabel, formatDeviation, formatArea, formatStationDistance } from './lib/priceFormat';

export { useViewport } from './hooks/useViewport';
export { useSemanticZoom, zoomToMode } from './hooks/useSemanticZoom';
export { useHeroRanking } from './hooks/useHeroRanking';


export { NlSearchBar } from './components/NlSearchBar';
export { SmartChips } from './components/SmartChips';
export { ActiveFilterPills } from './components/ActiveFilterPills';
export { SortMenu } from './components/SortMenu';
export { HeroPin } from './components/HeroPin';
export { HeroPinLayer } from './components/HeroPinLayer';
export { MiniCard } from './components/MiniCard';
export { SemanticZoomIndicator } from './components/SemanticZoomIndicator';
export { MapControls } from './components/MapControls';
export { ListPanel } from './components/ListPanel';

// L-v7 (2026-04-22): v7 핸드오프 Phase 1 신규 컴포넌트/훅
export { SumBox } from './components/SumBox';
export { CopyToastOutlet, useCopyToast } from './components/CopyToast';
export {
  PreconditionNote,
  DEFAULT_PRECOND_ITEMS,
  type PreconditionItem,
} from './components/PreconditionNote';
export {
  useFilterUrlSync,
  paramsToFilter,
  filterToParams,
} from './hooks/useFilterUrlSync';
// L-v7-p2 (2026-04-22): Phase 2 — scope 전파 토글
export { ScopeToggle } from './components/ScopeToggle';
// L-v7-p3 (2026-04-22): Phase 3 — 12 추가필터 아코디언
export { FilterAccordion, type FilterAccordionProps } from './components/FilterAccordion';
