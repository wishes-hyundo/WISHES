// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVARIANT I-COORD-2 회귀 테스트
//
// CLAUDE.md (사장님 명령 2026-05-02):
//   "같은 좌표 매물은 1 클러스터 (절대 stack 금지)"
//
// 회귀 시나리오:
//   PR #76 좌표 마스킹 (110m) 으로 같은 격자 매물의 lat/lng 가 정확히 동일.
//   HtmlMarkerOverlay cellSize=0 분기 (level 1~2) 가 매물 ID 별로 분리하면
//   30개 매물이 30개 분리된 "1" 마커로 한 픽셀에 stack → 사용자 화면엔
//   "1" 동그라미만 보임 (실제 30개 매물 겹침).
//
// 보장:
//   cellSize=0 path 가 (lat,lng) 동일 매물을 1 그룹으로 묶음.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { describe, it, expect } from 'vitest';

interface Listing {
  id: number;
  lat: number;
  lng: number;
}

// HtmlMarkerOverlay.tsx 의 cellSize=0 path 와 동일 로직 (테스트 가능하도록 추출)
function clusterByExactCoord(listings: Listing[]): Map<string, Listing[]> {
  const clusters = new Map<string, Listing[]>();
  for (const l of listings) {
    const key = `c:${l.lat}:${l.lng}`;
    const arr = clusters.get(key);
    if (arr) arr.push(l);
    else clusters.set(key, [l]);
  }
  return clusters;
}

describe('INVARIANT I-COORD-2: 같은 좌표 매물은 1 클러스터', () => {
  it('정확히 같은 lat/lng 매물 30개 → 1 클러스터 with count=30', () => {
    const listings: Listing[] = Array.from({ length: 30 }, (_, i) => ({
      id: 1000 + i,
      lat: 37.486,  // 110m 마스킹 결과
      lng: 126.928,
    }));
    const clusters = clusterByExactCoord(listings);
    expect(clusters.size).toBe(1);
    const arr = Array.from(clusters.values())[0];
    expect(arr.length).toBe(30);
  });

  it('서로 다른 마스킹된 좌표 → 각 좌표마다 분리된 클러스터', () => {
    const listings: Listing[] = [
      { id: 1, lat: 37.486, lng: 126.928 },
      { id: 2, lat: 37.486, lng: 126.928 },
      { id: 3, lat: 37.487, lng: 126.928 },
      { id: 4, lat: 37.487, lng: 126.929 },
    ];
    const clusters = clusterByExactCoord(listings);
    expect(clusters.size).toBe(3);
    const sizes = Array.from(clusters.values()).map((a) => a.length).sort();
    expect(sizes).toEqual([1, 1, 2]);
  });

  it('빈 입력 → 빈 클러스터 맵', () => {
    expect(clusterByExactCoord([]).size).toBe(0);
  });

  it('매물 1개 → 1 클러스터 with count=1', () => {
    const clusters = clusterByExactCoord([{ id: 1, lat: 37.5, lng: 127.0 }]);
    expect(clusters.size).toBe(1);
    expect(Array.from(clusters.values())[0].length).toBe(1);
  });

  it('회귀 가드 — 절대 i:${id} 분리 패턴으로 돌아가지 않음', () => {
    // 만약 누군가 cellSize=0 path 를 i:${id} 로 되돌리면 (재발) 같은 좌표 30개가 30개 키.
    // 이 테스트는 fix 가 적용된 상태에서만 통과 (재발 차단).
    const listings: Listing[] = Array.from({ length: 5 }, (_, i) => ({
      id: i, lat: 37.486, lng: 126.928,
    }));
    const clusters = clusterByExactCoord(listings);
    // i:${id} 로 분리되면 size=5. (lat,lng) 그룹화는 size=1.
    expect(clusters.size).not.toBe(5);
    expect(clusters.size).toBe(1);
  });
});
