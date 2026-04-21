// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// H3 Hexagon layer — 광역 줌에서 지역 밀도 + 중앙가격 표시
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { latLngToCell, isValidCell } from 'h3-js';
import type { MapListing } from '../store';

interface HexBucket {
  h3: string;
  count: number;
  medianPrice: number;
  deal: string;
}

/** 클라이언트 사이드 집계 (서버 RPC 대체 — 초기 Phase 1) */
function aggregate(listings: MapListing[], resolution: number): HexBucket[] {
  const buckets = new Map<string, { prices: number[]; count: number; deal: string }>();

  for (const l of listings) {
    // H3 는 유효 범위 밖이면 throw. 0,0 / NaN / 범위 초과 모두 걸러냄
    if (
      l.lat == null || l.lng == null ||
      !Number.isFinite(l.lat) || !Number.isFinite(l.lng) ||
      l.lat === 0 || l.lng === 0 ||
      l.lat < -90 || l.lat > 90 ||
      l.lng < -180 || l.lng > 180
    ) continue;
    let h3: string;
    try {
      h3 = latLngToCell(l.lat, l.lng, resolution);
    } catch {
      continue; // h3-js 가 여전히 싫다 하면 skip
    }
    const price =
      l.deal === '매매' ? l.price ?? 0 :
      l.deal === '전세' ? l.deposit ?? 0 :
      (l.deposit ?? 0) + (l.monthly ?? 0) * 100; // 월세 환산
    if (!buckets.has(h3)) buckets.set(h3, { prices: [], count: 0, deal: l.deal });
    const b = buckets.get(h3)!;
    if (price > 0) b.prices.push(price);
    b.count++;
  }

  const out: HexBucket[] = [];
  for (const [h3, { prices, count, deal }] of buckets) {
    prices.sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    out.push({ h3, count, medianPrice: median, deal });
  }
  return out;
}

/** 밀도 색상 램프 — WISHES 그린 계열 */
function colorForCount(c: number): [number, number, number, number] {
  if (c >= 50) return [22, 101, 52, 220];   // emerald-900
  if (c >= 20) return [22, 163, 74, 200];   // emerald-600
  if (c >= 10) return [34, 197, 94, 180];   // emerald-500
  if (c >= 5)  return [74, 222, 128, 160];  // emerald-400
  return [167, 243, 208, 140];              // emerald-200
}

export function buildHexLayer(
  listings: MapListing[],
  resolution: 6 | 7,
  onHexClick?: (h3: string) => void
): H3HexagonLayer<HexBucket> | null {
  // 이중 방어: aggregate 통과 후에도 h3 문자열이 유효한지 한 번 더 검증
  const data = aggregate(listings, resolution).filter((d) => isValidCell(d.h3));
  if (data.length === 0) return null;

  return new H3HexagonLayer<HexBucket>({
    id: `h3-r${resolution}`,
    data,
    extruded: false,
    filled: true,
    stroked: true,
    pickable: true,
    getHexagon: (d) => d.h3,
    getFillColor: (d) => colorForCount(d.count),
    getLineColor: [255, 255, 255, 180],
    lineWidthMinPixels: 1,
    coverage: 0.92,
    onClick: (info) => {
      if (info.object && onHexClick) onHexClick(info.object.h3);
    },
    updateTriggers: {
      getFillColor: [listings.length],
    },
  });
}
