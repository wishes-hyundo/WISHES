// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) tests/golden/golden.test.ts — Golden 50 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 단계 4 (이번): seeds.yaml 50 케이스 schema sanity 일괄 검증
//   - 페르소나 분포 (newcomer 20 / newlywed 15 / business 15)
//   - case ID g001 ~ g050 unique
//   - 각 케이스 schema 정상 (input / expected / must_* / sql_oracle)
//
// 단계 5 (예정): 각 케이스 sql_oracle 실행 → ID 집합 박제
//                callApi(input) 결과 vs sql_oracle 결과 차집합 0
// 단계 6 (예정): DOM Snapshot — 4 페이지 렌더 capture
// 단계 7 (예정): CI 통합
//
// 헌법 §125.1 + §72.1 + §96 Phase 1 새 기능 0 + §101 보존 5

import { describe, it, expect } from 'vitest';
import {
  loadGoldenCases,
  casesByPersona,
  expectedGoldenIds,
  type GoldenCase,
} from './fetcher';

describe('Golden 50 (PR-E §125 단계 4 + §72.1)', () => {
  const cases: GoldenCase[] = loadGoldenCases();

  // ──────────────────────────────────────────
  // 메타 검증 — 분포 / ID / 개수
  // ──────────────────────────────────────────
  it('총 50 케이스 로드', () => {
    expect(cases).toHaveLength(50);
  });

  it('페르소나 분포 — 사회초년생 20 / 신혼부부 15 / 사업자 15', () => {
    expect(casesByPersona('newcomer')).toHaveLength(20);
    expect(casesByPersona('newlywed')).toHaveLength(15);
    expect(casesByPersona('business')).toHaveLength(15);
  });

  it('case ID 형식 — g001 ~ g050 unique 50 개', () => {
    const ids = cases.map((c) => c.id).sort();
    expect(ids).toEqual(expectedGoldenIds());
  });

  // ──────────────────────────────────────────
  // Schema sanity — 각 케이스 50 개 it.each
  // ──────────────────────────────────────────
  it.each(cases.map((c) => [c.id, c.persona, c.name]))(
    'case %s (%s) — schema 정상',
    (id) => {
      const c = cases.find((x) => x.id === id)!;
      expect(c).toBeDefined();
      expect(typeof c.name).toBe('string');
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.input).toBeDefined();
      expect(typeof c.input).toBe('object');

      // 최소 1 개 input 필드 존재 (type / deal / gu 중 하나)
      const inputKeys = Object.keys(c.input);
      expect(inputKeys.length).toBeGreaterThan(0);

      // expected 카운트 sanity
      expect(c.expected_min_count).toBeGreaterThanOrEqual(0);
      expect(c.expected_max_count).toBeGreaterThanOrEqual(c.expected_min_count);

      // must_include / must_exclude — 단계 4 = 빈 배열, 단계 5 에서 박제
      expect(Array.isArray(c.must_include_id)).toBe(true);
      expect(Array.isArray(c.must_exclude_id)).toBe(true);

      // sql_oracle — 비어 있지 않은 SQL 문자열
      expect(typeof c.sql_oracle).toBe('string');
      expect(c.sql_oracle.length).toBeGreaterThan(20);
      expect(c.sql_oracle.toUpperCase()).toContain('SELECT');
      expect(c.sql_oracle).toContain('listings');
      expect(c.sql_oracle).toContain("status='공개'");
    }
  );

  // ──────────────────────────────────────────
  // 페르소나별 input 필드 일관성
  // ──────────────────────────────────────────
  it('newcomer 케이스 — type 은 원룸/투룸/쓰리룸 중 하나', () => {
    const allowed = ['원룸', '투룸', '쓰리룸'];
    casesByPersona('newcomer').forEach((c) => {
      const types = c.input.type ?? [];
      types.forEach((t) => {
        expect(allowed).toContain(t);
      });
    });
  });

  it('newlywed 케이스 — type 은 빌라/아파트/오피스텔 중 하나', () => {
    const allowed = ['빌라', '아파트', '오피스텔'];
    casesByPersona('newlywed').forEach((c) => {
      const types = c.input.type ?? [];
      types.forEach((t) => {
        expect(allowed).toContain(t);
      });
    });
  });

  it('business 케이스 — type 은 상가/사무실 중 하나', () => {
    const allowed = ['상가', '사무실'];
    casesByPersona('business').forEach((c) => {
      const types = c.input.type ?? [];
      types.forEach((t) => {
        expect(allowed).toContain(t);
      });
    });
  });

  it('newcomer 케이스 — deal 은 월세 (사회초년생 = 임대 위주)', () => {
    casesByPersona('newcomer').forEach((c) => {
      expect(c.input.deal).toEqual(['월세']);
    });
  });

  it('business 케이스 — deal 은 월세 (사업자 = 임대 위주)', () => {
    casesByPersona('business').forEach((c) => {
      expect(c.input.deal).toEqual(['월세']);
    });
  });

  it('newlywed 케이스 — deal 은 전세 또는 매매 (신혼부부 = 정착)', () => {
    const allowed = ['전세', '매매'];
    casesByPersona('newlywed').forEach((c) => {
      const deals = c.input.deal ?? [];
      deals.forEach((d) => {
        expect(allowed).toContain(d);
      });
    });
  });
});
