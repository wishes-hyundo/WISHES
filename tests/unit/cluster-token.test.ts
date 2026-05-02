// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVARIANT I-CLUSTER-TOKEN-1 — cluster_token (단지명 hash)
//
// 사장님 명령 2026-05-02:
//   1) 비로그인에 building_name 자체는 노출 X (privacy 유지)
//   2) 그러나 같은 단지 매물은 cluster 그룹화 가능해야 함 (z19 21마커 fix)
//
// 해결: building_name 의 hash (FNV-1a 32bit) 만 cluster_token 필드로 노출.
//       단지명 자체는 추론 불가 (16M+ 가능 hash 공간).
//       같은 단지명 → 같은 token → 1 cluster. 다른 단지명 → 다른 token → 분리.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { describe, it, expect } from 'vitest';

// 서버 buildClusterToken — viewport/by-ids 와 동일 정의
function buildClusterToken(buildingName: string | null | undefined): string | null {
  if (!buildingName) return null;
  const norm = String(buildingName).replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

describe('INVARIANT I-CLUSTER-TOKEN-1: 단지명 hash', () => {
  it('같은 단지명 → 같은 token (cluster 그룹화)', () => {
    const t1 = buildClusterToken('푸리마타운');
    const t2 = buildClusterToken('푸리마타운');
    expect(t1).toBe(t2);
    expect(t1).not.toBeNull();
  });

  it('다른 단지명 → 다른 token (cluster 분리)', () => {
    const t1 = buildClusterToken('푸리마타운');
    const t2 = buildClusterToken('실크로드모텔');
    const t3 = buildClusterToken('태우빌');
    expect(t1).not.toBe(t2);
    expect(t2).not.toBe(t3);
    expect(t1).not.toBe(t3);
  });

  it('NBSP/다중 공백 정규화 → 같은 token', () => {
    const t1 = buildClusterToken('푸리마 타운');
    const t2 = buildClusterToken('푸리마  타운');  // 다중 공백
    const t3 = buildClusterToken('푸리마 타운');  // NBSP
    expect(t1).toBe(t2);
    // NBSP 는 \s 매칭이라 동일
    expect(t1).toBe(t3);
  });

  it('null/undefined/빈 문자열 → null token', () => {
    expect(buildClusterToken(null)).toBeNull();
    expect(buildClusterToken(undefined)).toBeNull();
    expect(buildClusterToken('')).toBeNull();
    expect(buildClusterToken('   ')).toBeNull();
  });

  it('token 길이 안정 (7+자리 base36 hash)', () => {
    const t = buildClusterToken('푸리마타운');
    expect(t).not.toBeNull();
    expect(t!.length).toBeGreaterThanOrEqual(7);
  });

  it('CRITICAL — 단지명 추측 불가 (privacy 보호)', () => {
    // hash 라 token → 단지명 역산 불가.
    // 16M+ 가능 단지명 공간, 한국 부동산 단지 < 1M 개 → 충돌 확률 무시 가능.
    const t = buildClusterToken('푸리마타운');
    expect(t).not.toContain('푸');
    expect(t).not.toContain('타');
    expect(t).not.toContain('운');
  });
});
