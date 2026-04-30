// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) tests/golden/sql-oracle.test.ts — Oracle 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 단계 5 (이번): baseline.json schema sanity + 박제 시 entries 상한 검증
// 단계 6 (예정): API 결과 vs baseline.json 차집합 0 (msw 핸들러 보강)
// 단계 7 (예정): CI 통합 — baseline.json 미박제 시 skip, 박제 시 strict
//
// 헌법:
//   §125.1 단계 5 — API 응답 ID 집합 vs 직접 SQL ID 집합 → 차집합 0
//   §72.1     — Golden 50 형식
//   §96       — Phase 1 새 기능 0
//   §101      — 보존 5 원칙

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadGoldenCases, expectedGoldenIds } from './fetcher';

interface BaselineEntry {
  id: string;
  persona: string;
  name: string;
  count: number;
  ids: number[];
  sample_ids: number[];
  generated_at: string;
}

interface Baseline {
  generated_at: string | null;
  total_cases: number;
  total_ids: number;
  entries: Record<string, BaselineEntry>;
  warnings: string[];
}

function loadBaseline(): Baseline {
  const baselinePath = path.resolve(__dirname, 'baseline.json');
  const raw = readFileSync(baselinePath, 'utf-8');
  return JSON.parse(raw) as Baseline;
}

const baseline = loadBaseline();
const isPlaceholder = baseline.total_cases === 0 || baseline.generated_at === null;

describe('SQL Oracle baseline.json (PR-E §125 단계 5 + §72.1)', () => {
  it('baseline.json 로드 성공', () => {
    expect(baseline).toBeDefined();
    expect(typeof baseline.total_cases).toBe('number');
    expect(Array.isArray(baseline.warnings)).toBe(true);
  });

  it.skipIf(isPlaceholder)('박제 후 — 50 케이스 entries 일치', () => {
    expect(baseline.total_cases).toBe(50);
    expect(Object.keys(baseline.entries).sort()).toEqual(expectedGoldenIds());
  });

  it.skipIf(isPlaceholder)('박제 후 — 각 케이스 schema sanity', () => {
    const cases = loadGoldenCases();
    cases.forEach((c) => {
      const e = baseline.entries[c.id];
      expect(e, `${c.id} entry 누락`).toBeDefined();
      expect(e.id).toBe(c.id);
      expect(e.persona).toBe(c.persona);
      expect(e.name).toBe(c.name);
      expect(e.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(e.ids)).toBe(true);
      expect(Array.isArray(e.sample_ids)).toBe(true);
      expect(e.sample_ids.length).toBeLessThanOrEqual(5);
      expect(typeof e.generated_at).toBe('string');
    });
  });

  it.skipIf(isPlaceholder)('박제 후 — count 가 expected_min_count ~ expected_max_count 범위 (탄력 있게)', () => {
    const cases = loadGoldenCases();
    const drift: string[] = [];
    cases.forEach((c) => {
      const e = baseline.entries[c.id];
      if (!e) return;
      // 절대 비례 + 1 — expected_min 이 1 이라도 결과 0 면 경고만 (라이브 데이터 변동 흡수)
      if (e.count < c.expected_min_count) {
        drift.push(`${c.id} count=${e.count} < expected_min=${c.expected_min_count}`);
      }
      if (e.count > c.expected_max_count) {
        drift.push(`${c.id} count=${e.count} > expected_max=${c.expected_max_count}`);
      }
    });
    // drift 가 5 케이스 이하면 통과 (50 중 10% 이내 — 데이터 변동 흡수)
    expect(drift, `count drift 너무 큼 (${drift.length}/50):\n  ${drift.join('\n  ')}`).toHaveLength(
      Math.min(drift.length, 5)
    );
  });

  it.skipIf(isPlaceholder)('박제 후 — 라이브 분포 sanity (총 ID 1000 이상)', () => {
    expect(baseline.total_ids).toBeGreaterThan(1000);
  });

  it.skipIf(!isPlaceholder)('placeholder — 사장님 환경에서 npm run oracle 1회 실행 후 박제 필요', () => {
    expect(baseline.warnings.length).toBeGreaterThan(0);
    expect(baseline.warnings[0]).toMatch(/placeholder/);
  });
});

// ──────────────────────────────────────────
// 단계 6 추가 예정 — API 결과 vs baseline 차집합 0
//
// it.each(loadGoldenCases())('case %s API 결과 = baseline ids', async (c) => {
//   const apiIds = await callListingsSearchApi(c.input);
//   const baselineIds = baseline.entries[c.id].ids;
//   const diff = symmetricDiff(apiIds, baselineIds);
//   expect(diff).toHaveLength(0);
// });
// ──────────────────────────────────────────
