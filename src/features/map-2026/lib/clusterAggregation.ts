// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// clusterAggregation.ts — Wave 23 (2026-05-04 사장님 명령)
//
// 목적: HtmlMarkerOverlay 의 cluster 집계 / spider-fy / centroid 계산 로직을
// 공통 lib 로 추출. KakaoDeckOverlay (WebGL) 가 같은 함수 재사용 → 동작 일관성 + 영구
// 해결책 (deck.gl 마이그레이션 Wave 24~27) 의 기반.
//
// 보존 INVARIANTs (사장님 명령 2026-05-02 / 2026-05-04):
//   I-MARKER-1: 마커 grid 단지 단위 정밀 (gridSizeForLevel)
//   I-MARKER-2: cluster_token / building_name 우선 cluster
//   I-MARKER-3: TIER1 단지 마커 = building_centroids 정확 좌표
//   I-MARKER-4: 광역 줌 (cellSize > 0) grid cluster
//   I-MARKER-5: 가까이 줌 (cellSize == 0) 같은 좌표 매물 cluster
//   I-MARKER-6: 클러스터 필터 활성 시 spider-fy radial spread (G-123)
//
// Wave 23 변경: refactor only — HtmlMarkerOverlay 의 inline 로직을 그대로 옮김.
//   동작 변경 X. DOM 마커 출력 100% 동일 보장.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MapListing } from '@/features/map-2026/store';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-3: TIER1 매물 정확 단지 좌표 (building_centroids)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const TIER1_TYPES = new Set<string>([
  '아파트',
  '오피스텔',
  '주상복합',
  '도시형생활주택',
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-1: zoom level → grid cell 크기 (위경도 degree)
// 1 deg lat ≈ 111km. level 1 (가장 가까움) ~ 14 (가장 멀음).
// 사장님 명령 누적 (마지막 갱신 2026-05-02):
//   L-mapfix-2026-05-02: level 1~2 (z18+) 가장 가까운 줌 grid 비활성 (cellSize=0)
//   L-grid-precision1: cellSize 1/3~1/2 축소 (단지 단위 정확도)
//   L-marker-noise-fix1: z16 빽빽 노이즈 fix — cellSize 220m
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function gridSizeForLevel(level: number): number {
  if (level <= 2) return 0;
  if (level <= 3) return 0.0010;
  if (level <= 4) return 0.0020;
  if (level <= 5) return 0.0040;
  if (level <= 6) return 0.0080;
  if (level <= 7) return 0.0140;
  if (level <= 8) return 0.0220;
  if (level <= 9) return 0.035;
  if (level <= 10) return 0.050;
  if (level <= 11) return 0.075;
  if (level <= 12) return 0.110;
  return 0.180;
}

// 단지명 정규화 (NBSP / 다중 공백 → 한 칸)
export function normalizeBuildingName(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-4 / I-MARKER-5: cluster 집계
//   cellSize > 0 (광역) → grid cell 단위
//   cellSize == 0 (가까이) → 같은 좌표 매물끼리 cluster
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function aggregateClusters(
  listings: MapListing[],
  level: number,
  isClusterFilterActive: boolean,
): Map<string, MapListing[]> {
  const cellSize = isClusterFilterActive ? 0 : gridSizeForLevel(level);
  const clusters = new Map<string, MapListing[]>();
  // Wave 67b (R-C1 / I-MARKER-2): cluster_token priority — same building name -> same cluster
  if (cellSize > 0) {
    for (const l of listings) {
      const key = l.cluster_token
        ? `t:${l.cluster_token}`
        : `g:${Math.floor(l.lat / cellSize)}:${Math.floor(l.lng / cellSize)}`;
      const arr = clusters.get(key);
      if (arr) arr.push(l);
      else clusters.set(key, [l]);
    }
  } else {
    for (const l of listings) {
      const key = l.cluster_token
        ? `t:${l.cluster_token}`
        : `c:${l.lat.toFixed(6)}:${l.lng.toFixed(6)}`;
      const arr = clusters.get(key);
      if (arr) arr.push(l);
      else clusters.set(key, [l]);
    }
  }
  return clusters;
}

// FNV-1a 32bit hash — deterministic jitter seed
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-3: cluster centroid 계산
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface ClusterPosition {
  lat: number;
  lng: number;
  isTier1: boolean;
  tier1Listing: MapListing | null;
}

export function computeClusterPosition(arr: MapListing[]): ClusterPosition {
  const tier1Listing =
    arr.find((l) => {
      const t = (l.type ?? '').trim();
      return (
        TIER1_TYPES.has(t) &&
        typeof l.tier1_lat === 'number' &&
        typeof l.tier1_lng === 'number'
      );
    }) ?? null;

  if (tier1Listing) {
    return {
      lat: tier1Listing.tier1_lat as number,
      lng: tier1Listing.tier1_lng as number,
      isTier1: true,
      tier1Listing,
    };
  }

  let latSum = 0;
  let lngSum = 0;
  for (const l of arr) {
    latSum += l.lat;
    lngSum += l.lng;
  }
  const baseLat = latSum / arr.length;
  const baseLng = lngSum / arr.length;

  const seedStr = arr[0].cluster_token ?? String(arr[0].id);
  const h = fnv1aHash(seedStr);
  const jitterLat = ((h & 0xffff) / 0xffff - 0.5) * 0.001;
  const jitterLng = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.001;

  return {
    lat: baseLat + jitterLat,
    lng: baseLng + jitterLng,
    isTier1: false,
    tier1Listing: null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-6 (G-123): cluster filter 활성 시 spider-fy radial spread
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface SpiderFyResult {
  listing: MapListing;
  displayLat: number;
  displayLng: number;
}

export function applySpiderFy(listings: MapListing[]): SpiderFyResult[] {
  const coordGroups = new Map<string, MapListing[]>();
  for (const l of listings) {
    const key = `${l.lat.toFixed(5)}:${l.lng.toFixed(5)}`;
    const arr = coordGroups.get(key);
    if (arr) arr.push(l);
    else coordGroups.set(key, [l]);
  }

  const result: SpiderFyResult[] = [];
  for (const [, group] of coordGroups) {
    const baseLat = group[0].lat;
    const baseLng = group[0].lng;
    const N = group.length;
    const radiusDeg = N === 1 ? 0 : Math.min(0.0006, 0.00015 + N * 0.000025);
    group.forEach((l, idx) => {
      if (N === 1) {
        result.push({ listing: l, displayLat: l.lat, displayLng: l.lng });
      } else {
        const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
        result.push({
          listing: l,
          displayLat: baseLat + radiusDeg * Math.sin(angle),
          displayLng: baseLng + radiusDeg * Math.cos(angle),
        });
      }
    });
  }
  return result;
}
