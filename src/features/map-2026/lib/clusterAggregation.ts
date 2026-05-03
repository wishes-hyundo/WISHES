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
//
// 사장님 명령 누적 (마지막 갱신 2026-05-02):
//   L-mapfix-2026-05-02: level 1~2 (z18+) 가장 가까운 줌 grid 비활성 (cellSize=0)
//   L-grid-precision1: cellSize 1/3~1/2 축소 (단지 단위 정확도)
//   L-marker-noise-fix1: z16 빽빽 노이즈 fix — cellSize 220m (이전 110m 의 2배)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function gridSizeForLevel(level: number): number {
  if (level <= 2) return 0;       // z18+ 단독 (같은 좌표 자연 그룹)
  if (level <= 3) return 0.0010;  // z17 ~110m
  if (level <= 4) return 0.0020;  // z16 ~220m (핵심 fix — 빽빽 노이즈 해소)
  if (level <= 5) return 0.0040;  // z15 ~440m
  if (level <= 6) return 0.0080;  // z14 ~880m
  if (level <= 7) return 0.0140;  // z13 ~1.5km
  if (level <= 8) return 0.0220;  // z12 ~2.4km
  if (level <= 9) return 0.035;   // z11 ~3.9km
  if (level <= 10) return 0.050;  // z10 ~5.5km
  if (level <= 11) return 0.075;  // z9 ~8.3km
  if (level <= 12) return 0.110;  // z8 ~12km
  return 0.180;                   // z7- ~20km (전국 뷰)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 단지명 정규화 (NBSP / 다중 공백 → 한 칸)
// I-MARKER-2 cluster key 안정성용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function normalizeBuildingName(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-4 / I-MARKER-5: cluster 집계
//   cellSize > 0 (광역 줌 z14~z17) → grid cell 단위 (cluster_token 무시)
//   cellSize == 0 (가까이 z18+) → 같은 좌표 매물끼리 cluster (직방 동작)
//
// 사장님 명령 2026-05-02 (M-7): 광역 뷰에서 cluster_token 사용하면 마커 수천 개.
//   광역 = grid (큰 묶음), 가까이 = 좌표 (정확).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function aggregateClusters(
  listings: MapListing[],
  level: number,
  isClusterFilterActive: boolean,
): Map<string, MapListing[]> {
  // L-mapfix-2026-05-02 (사장님): cluster filter 활성 시 grid 비활성 — spider-fy 단계로 위임.
  const cellSize = isClusterFilterActive ? 0 : gridSizeForLevel(level);
  const clusters = new Map<string, MapListing[]>();

  if (cellSize > 0) {
    // 광역 줌: grid cell 단위 cluster
    for (const l of listings) {
      const key = `g:${Math.floor(l.lat / cellSize)}:${Math.floor(l.lng / cellSize)}`;
      const arr = clusters.get(key);
      if (arr) arr.push(l);
      else clusters.set(key, [l]);
    }
  } else {
    // 가까이 줌 (z18+): 같은 lat/lng 매물 = 1 cluster
    for (const l of listings) {
      const key = `c:${l.lat.toFixed(6)}:${l.lng.toFixed(6)}`;
      const arr = clusters.get(key);
      if (arr) arr.push(l);
      else clusters.set(key, [l]);
    }
  }
  return clusters;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FNV-1a 32bit hash — cluster_token 또는 첫 매물 id 기반 deterministic jitter seed.
// 같은 cluster = 같은 jitter (안정).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I-MARKER-3: cluster centroid 계산.
//   cluster 안 1개라도 TIER1 + tier1_lat/lng 있으면 그 좌표 사용 (단지 정확 위치).
//   없으면 좌표 평균 + deterministic jitter ±0.0005 (~55m) 로 격자 패턴 깨기.
//
// 사장님 명령 2026-05-02 M-3: "병신같은 grid 방식 걍 나가뒤져" — 110m 마스킹 cell
//   안에서 분산 (cluster_token hash 기반 안정 jitter).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface ClusterPosition {
  lat: number;
  lng: number;
  isTier1: boolean;
  tier1Listing: MapListing | null;
}

export function computeClusterPosition(arr: MapListing[]): ClusterPosition {
  // K-2: cluster 안 1개라도 TIER1 + tier1_lat/lng 있으면 단지 정확 좌표 사용
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

  // 폴백: 좌표 평균 + jitter
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
  // ±0.0005 (~55m) — 110m 마스킹 cell 안 분산
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
// I-MARKER-6 (G-123): cluster filter 활성 시 spider-fy radial spread.
//   같은 좌표 매물들이 한 점에 stack 되면 사용자가 매물 위치 인지 불가.
//   직방/네이버 표준 — cluster 클릭 시 그 안 매물 모두 펼쳐 보이게.
//
// 입력: 매물 배열
// 출력: [{ listing, displayLat, displayLng }] — 같은 좌표 그룹은 12시 방향부터 N등분 원형 분산.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface SpiderFyResult {
  listing: MapListing;
  displayLat: number;
  displayLng: number;
}

export function applySpiderFy(listings: MapListing[]): SpiderFyResult[] {
  // 같은 좌표 그룹 찾기 (소수점 5자리 = ~1m)
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
    // R 은 N 에 비례 (N=2: ±15m, N=10: ±40m, N=20+: ±60m)
    const radiusDeg = N === 1 ? 0 : Math.min(0.0006, 0.00015 + N * 0.000025);
    group.forEach((l, idx) => {
      if (N === 1) {
        result.push({ listing: l, displayLat: l.lat, displayLng: l.lng });
      } else {
        const angle = (2 * Math.PI *