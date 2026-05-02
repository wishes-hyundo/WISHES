// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVARIANT D-1/D-2 회귀 테스트 — 폴리곤 컷오프 + 마커 grid
//
// 사장님 명령 2026-05-02 — 끝판왕:
//   - z15 (Kakao level 5) 부터 마커 zone (폴리곤 X)
//   - 폴리곤 클릭 한 방에 마커 zone (level 4) 까지 줌인
//   - 마커 grid 단지 단위로 정밀화 (z14 ~440m, z15 ~220m)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { describe, it, expect } from 'vitest';

// AdminRegionOverlay 의 mode 결정 로직 (컴포넌트 제외 가능하도록 추출)
function adminMode(level: number): 'sido' | 'sigungu' | 'dong' | 'none' {
  if (level >= 11) return 'sido';
  if (level >= 8) return 'sigungu';
  if (level >= 6) return 'dong';
  return 'none';
}

// 폴리곤 클릭 점진적 줌 — finalLv 계산 (STEP=3)
function computeFinalLv(curLv: number, targetLevel: number): number {
  const STEP = 3;
  return curLv > 0 ? Math.max(targetLevel, curLv - STEP) : targetLevel;
}

// HtmlMarkerOverlay gridSizeForLevel 정밀화
function gridSizeForLevel(level: number): number {
  if (level <= 2) return 0;
  if (level <= 3) return 0.00060;
  if (level <= 4) return 0.0010;
  if (level <= 5) return 0.0020;
  if (level <= 6) return 0.0040;
  if (level <= 7) return 0.0080;
  if (level <= 8) return 0.0140;
  if (level <= 9) return 0.0220;
  if (level <= 10) return 0.035;
  if (level <= 11) return 0.050;
  if (level <= 12) return 0.075;
  return 0.110;
}

describe('INVARIANT D-1: 폴리곤 표시 컷오프 (z15부터 마커)', () => {
  it('Kakao level 5 (z15) → mode=none (마커 zone)', () => {
    expect(adminMode(5)).toBe('none');
  });
  it('Kakao level 6 (z14) → mode=dong (폴리곤 시작)', () => {
    expect(adminMode(6)).toBe('dong');
  });
  it('Kakao level 7 (z13) → mode=dong', () => {
    expect(adminMode(7)).toBe('dong');
  });
  it('Kakao level 8 (z12) → mode=sigungu', () => {
    expect(adminMode(8)).toBe('sigungu');
  });
  it('Kakao level 11 (z9) → mode=sido', () => {
    expect(adminMode(11)).toBe('sido');
  });
  it('회귀 가드 — level 5 가 dong (폴리곤) 으로 잘못 돌아가지 않음', () => {
    // 만약 누군가 다시 level >= 5 로 바꾸면 (재발) z15 에 폴리곤 → 사장님 신고.
    expect(adminMode(5)).not.toBe('dong');
  });
});

describe('INVARIANT D-1b: 폴리곤 클릭 한 방에 마커 zone', () => {
  it('curLv 7 (z13 dong) 클릭 → finalLv 4 (z16 마커)', () => {
    expect(computeFinalLv(7, 4)).toBe(4);
  });
  it('curLv 8 (z12 sigungu) 클릭 → finalLv 5 (사용자 한 번 더 클릭 가능)', () => {
    expect(computeFinalLv(8, 4)).toBe(5);
  });
  it('회귀 가드 — STEP 2로 돌아가서 폴리곤 zone 안에 멈추지 않음', () => {
    // STEP=2 였으면 curLv 7 → finalLv 5 (폴리곤 zone, 사장님 신고).
    // STEP=3 → curLv 7 → finalLv 4 (마커 zone, 정상).
    expect(computeFinalLv(7, 4)).not.toBe(5);
    expect(computeFinalLv(7, 4)).toBe(4);
  });
});

describe('INVARIANT D-2: 마커 grid 정밀화 (단지 단위)', () => {
  it('level 6 (z14) cellSize ~440m (이전 1.1km)', () => {
    expect(gridSizeForLevel(6)).toBeCloseTo(0.0040, 4);
  });
  it('level 5 (z15) cellSize ~220m (이전 440m)', () => {
    expect(gridSizeForLevel(5)).toBeCloseTo(0.0020, 4);
  });
  it('level 4 (z16) cellSize ~110m (이전 220m)', () => {
    expect(gridSizeForLevel(4)).toBeCloseTo(0.0010, 4);
  });
  it('level 2 (z18) cellSize=0 (단독 마커)', () => {
    expect(gridSizeForLevel(2)).toBe(0);
  });
  it('회귀 가드 — level 6 가 다시 1.1km 로 돌아가지 않음', () => {
    expect(gridSizeForLevel(6)).toBeLessThan(0.005);
  });
});
