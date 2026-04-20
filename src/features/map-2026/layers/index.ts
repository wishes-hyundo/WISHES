// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer diff — store 상태로부터 현재 표시해야 할 deck.gl 레이어 배열 생성
// MapClient 의 useEffect 에서 overlay.setProps({ layers: buildLayers(state) })
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Layer } from '@deck.gl/core';
import type { Map2026Store, MapListing } from '../store';
import { buildHexLayer } from './hexLayer';
import { buildScatterLayer } from './scatterLayer';
import { buildIsochroneLayer } from './isochroneLayer';

type Ctx = Pick<
  Map2026Store,
  'listings' | 'heroes' | 'mode' | 'isochrone' | 'heatmap' | 'threeD' | 'similar' | 'selectedId'
> & {
  isochronePayload?: import('./isochroneLayer').IsochronePayload | null;
  onHover?: (info: { object: MapListing | null; x: number; y: number }) => void;
  onClick?: (info: { object: MapListing | null }) => void;
  onHexClick?: (h3: string) => void;
};

export function buildLayers(ctx: Ctx): Layer[] {
  const layers: Layer[] = [];

  // 1) 등고선 (켜져있을 때만)
  if (ctx.isochrone && ctx.isochronePayload) {
    const iso = buildIsochroneLayer(ctx.isochronePayload);
    if (iso) layers.push(iso);
  }

  // 2) 모드별 주 레이어
  switch (ctx.mode) {
    case 'hexagon-low':
      layers.push(buildHexLayer(ctx.listings, 6, ctx.onHexClick));
      break;
    case 'hexagon-mid':
      layers.push(buildHexLayer(ctx.listings, 7, ctx.onHexClick));
      break;
    case 'pins':
    case '3d': {
      // hero 가 아닌 매물은 작은 점으로 (배경 밀도)
      const heroIds = new Set(ctx.heroes.map((h) => h.id));
      const nonHero = ctx.listings.filter((l) => !heroIds.has(l.id));
      layers.push(
        buildScatterLayer(
          nonHero,
          (info) => ctx.onHover?.({ object: info.object ?? null, x: info.x, y: info.y }),
          (info) => ctx.onClick?.({ object: info.object ?? null })
        )
      );
      break;
    }
  }

  return layers;
}
