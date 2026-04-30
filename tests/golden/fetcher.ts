// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) tests/golden/fetcher.ts — Golden 50 로더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 단계 4 (이번): seeds.yaml 파싱 + 타입 가드 + persona 분포 helper
// 단계 5 (예정): callApi(input) — fetch wrapper / runSqlOracle(sql) — pg client
// 단계 6 (예정): renderPage(path) — Next.js renderToString
//
// 헌법 §125.1 + §72.1 + §101 보존 5 (정리·연결·통합·보강만)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export type Persona = 'newcomer' | 'newlywed' | 'business';

export interface GoldenInput {
  type?: string[];
  deal?: string[];
  gu?: string[];
  monthly_max?: number;
  deposit_max?: number;
  price_max?: number;
  area_m2_min?: number;
  area_m2_max?: number;
  rooms_min?: number;
  rooms_max?: number;
}

export interface GoldenCase {
  id: string;            // g001 ~ g050
  persona: Persona;
  name: string;
  input: GoldenInput;
  expected_min_count: number;
  expected_max_count: number;
  must_include_id: number[];
  must_exclude_id: number[];
  sql_oracle: string;
}

interface SeedsFile {
  cases: GoldenCase[];
}

/**
 * seeds.yaml 로드 + 케이스 50 개 반환.
 *
 * 단계 4 = 파싱·검증 sanity 만.
 * 단계 5 부터 각 케이스의 sql_oracle 을 직접 실행하여 ID 집합 박제.
 */
export function loadGoldenCases(): GoldenCase[] {
  const seedsPath = path.resolve(__dirname, 'seeds.yaml');
  const raw = readFileSync(seedsPath, 'utf-8');
  const parsed = parse(raw) as SeedsFile;
  if (!parsed?.cases || !Array.isArray(parsed.cases)) {
    throw new Error(
      'tests/golden/seeds.yaml 파싱 실패 — cases 배열 없음 (PR-E §125 단계 4)'
    );
  }
  return parsed.cases;
}

/**
 * 페르소나별 케이스 필터.
 */
export function casesByPersona(persona: Persona): GoldenCase[] {
  return loadGoldenCases().filter((c) => c.persona === persona);
}

/**
 * Golden ID 형식 검증 — g001 ~ g050.
 */
export function expectedGoldenIds(): string[] {
  return Array.from({ length: 50 }, (_, i) => `g${String(i + 1).padStart(3, '0')}`);
}
