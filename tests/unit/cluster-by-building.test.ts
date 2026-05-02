// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVARIANT I-MARKER-2 — 같은 building_name 1 마커 / 다른 단지명 분리
//
// 사장님 명령 2026-05-02 (직방/네이버 표준):
//   z19 가장 확대 시 21 마커가 다른 주소 매물을 묶지 못 함.
//   같은 building_name = 단지명 → 1 마커, 다른 단지명 → 분리.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { describe, it, expect } from 'vitest';

interface Listing { id: number; lat: number; lng: number; building_name: string | null }

const normName = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

function clusterByBuildingThenCoord(listings: Listing[], cellSize: number): Map<string, Listing[]> {
  const clusters = new Map<string, Listing[]>();
  const buildKey = (l: Listing, fallback: string): string => {
    const n = normName(l.building_name);
    return n ? `b:${n}` : fallback;
  };
  for (const l of listings) {
    const fallback = cellSize > 0
      ? `g:${Math.floor(l.lat / cellSize)}:${Math.floor(l.lng / cellSize)}`
      : `c:${l.lat}:${l.lng}`;
    const key = buildKey(l, fallback);
    const arr = clusters.get(key);
    if (arr) arr.push(l);
    else clusters.set(key, [l]);
  }
  return clusters;
}

describe('INVARIANT I-MARKER-2: building_name 우선 cluster', () => {
  it('같은 단지명 매물 — 좌표 같으면 같은 클러스터 (count=2)', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
      { id: 2, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).toBe(1);
    expect(Array.from(c.values())[0].length).toBe(2);
  });

  it('같은 단지명 매물 — 좌표 달라도 같은 클러스터 (단지명 우선)', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
      { id: 2, lat: 37.487, lng: 126.929, building_name: '푸리마타운' },
    ];
    const c = clusterByBuildingThenCoord(list, 0.0010);
    expect(c.size).toBe(1);
    expect(Array.from(c.values())[0].length).toBe(2);
  });

  it('CRITICAL — 같은 좌표 다른 단지명 매물 분리 (사장님 z19 21 마커 fix)', () => {
    // 사장님 발견: 110m 마스킹으로 다른 단지 매물이 같은 좌표 → 21 마커 한 곳.
    // 수정: 단지명 다르면 분리.
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
      { id: 2, lat: 37.486, lng: 126.928, building_name: '실크로드모텔' },
      { id: 3, lat: 37.486, lng: 126.928, building_name: '태우빌' },
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).toBe(3);  // 같은 좌표지만 단지명 다르므로 3 분리
  });

  it('단지명 없는 매물끼리는 좌표 fallback', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: null },
      { id: 2, lat: 37.486, lng: 126.928, building_name: null },
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).toBe(1);
  });

  it('단지명 정규화 — NBSP/다중 공백 처리', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: '푸리마 타운' },
      { id: 2, lat: 37.486, lng: 126.928, building_name: '푸리마  타운' },  // 다중 공백
      { id: 3, lat: 37.486, lng: 126.928, building_name: '푸리마 타운' },  // NBSP
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).toBe(1);  // 모두 정규화 후 같은 이름
  });

  it('단지명 매물 + 단지명 없는 매물 mix', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
      { id: 2, lat: 37.486, lng: 126.928, building_name: null },
      { id: 3, lat: 37.486, lng: 126.928, building_name: '푸리마타운' },
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).toBe(2);  // 푸리마타운(2) + null fallback(1)
  });

  it('회귀 가드 — 좌표만 그룹 패턴(c:lat:lng)으로 돌아가서 다른 단지 합쳐지지 않음', () => {
    const list: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928, building_name: 'A' },
      { id: 2, lat: 37.486, lng: 126.928, building_name: 'B' },
    ];
    const c = clusterByBuildingThenCoord(list, 0);
    expect(c.size).not.toBe(1);  // 1 이면 좌표만 그룹 (회귀)
    expect(c.size).toBe(2);
  });
});
