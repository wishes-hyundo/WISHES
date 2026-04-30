// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 5 — SQL Oracle 베이스라인 생성기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 실행:
//   npm run oracle
//   (또는: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/sql-oracle.ts)
//
// 동작:
//   1. tests/golden/seeds.yaml 50 케이스 로드
//   2. 각 케이스 sql_oracle 직접 실행 → ID 집합 추출
//   3. tests/golden/baseline.json 으로 박제
//   4. 카운트가 expected_min/max 범위 벗어나면 경고 (오류는 X — 데이터 변동 흡수)
//
// 헌법:
//   §125.1 단계 5 — "API 응답 ID 집합 vs 직접 SQL ID 집합 → 차집합 0"
//   §72.1     — Golden 50 형식
//   §96/§101  — Phase 1 / 보존 5 원칙 (read-only SELECT)
//
// 사용 시점:
//   1) PR-E 단계 5 최초 1 회 (사장님 환경에서)
//   2) PR-G 머지 전 1 회 재생성 (trigger 5 등록 후 결과 비교)
//   3) 이후 cron 자동 (단계 8 후속)

// PR-E §125 단계 5: 환경변수 자동 로드 (.env.local + .env fallback)
//   tsx 는 dotenv 자동 로드 X — 명시적 import 필요
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

interface GoldenInput {
  type?: string[];
  deal?: string[];
  gu?: string[];
  monthly_max?: number;
  deposit_max?: number;
  price_max?: number;
}

interface GoldenCase {
  id: string;
  persona: string;
  name: string;
  input: GoldenInput;
  expected_min_count: number;
  expected_max_count: number;
  must_include_id: number[];
  must_exclude_id: number[];
  sql_oracle: string;
}

interface BaselineEntry {
  id: string;
  persona: string;
  name: string;
  count: number;
  ids: number[];
  sample_ids: number[];     // 첫 5 개 (must_include_id 후보)
  generated_at: string;
}

interface Baseline {
  generated_at: string;
  total_cases: number;
  total_ids: number;
  entries: Record<string, BaselineEntry>;
  warnings: string[];
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[oracle] 누락된 환경변수:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL  (현재:', SUPABASE_URL ?? 'undefined', ')');
  console.error('  SUPABASE_SERVICE_ROLE_KEY (현재:', SUPABASE_SERVICE_ROLE_KEY ? '설정됨' : 'undefined', ')');
  console.error('');
  console.error('  .env.local 또는 환경변수로 주입 후 재실행.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runCase(c: GoldenCase): Promise<BaselineEntry> {
  // sql_oracle 은 SELECT id ... 형식. supabase RPC 또는 직접 query.
  // supabase-js 는 raw SQL 미지원 → PostgREST 빌더로 재구성.
  const i = c.input;
  let q = supabase.from('listings').select('id', { count: 'exact' }).eq('status', '공개');

  // PR-A: type_normalized 사용 (raw type 컬럼은 dual-write 보존, SSOT 는 type_normalized)
  if (i.type?.length) q = q.in('type_normalized', i.type);
  if (i.deal?.length) q = q.in('deal', i.deal);
  if (i.gu?.length) q = q.in('gu', i.gu);
  if (i.monthly_max != null) q = q.lte('monthly', i.monthly_max);
  if (i.deposit_max != null) q = q.lte('deposit', i.deposit_max);
  if (i.price_max != null) q = q.lte('price', i.price_max);

  q = q.order('id', { ascending: true }).limit(20000);

  const { data, error, count } = await q;
  if (error) {
    throw new Error(`[oracle] ${c.id} 쿼리 실패: ${error.message}`);
  }

  const ids = (data ?? []).map((r) => r.id as number);

  return {
    id: c.id,
    persona: c.persona,
    name: c.name,
    count: count ?? ids.length,
    ids,
    sample_ids: ids.slice(0, 5),
    generated_at: new Date().toISOString(),
  };
}

async function main() {
  const seedsPath = path.resolve(__dirname, '..', 'tests', 'golden', 'seeds.yaml');
  const baselinePath = path.resolve(__dirname, '..', 'tests', 'golden', 'baseline.json');

  console.log('[oracle] seeds.yaml 로드:', seedsPath);
  const raw = readFileSync(seedsPath, 'utf-8');
  const parsed = parse(raw) as { cases: GoldenCase[] };
  const cases = parsed.cases;
  console.log(`[oracle] 50 케이스 로드 완료 (실제: ${cases.length})`);

  const entries: Record<string, BaselineEntry> = {};
  const warnings: string[] = [];
  let totalIds = 0;

  for (const c of cases) {
    process.stdout.write(`[oracle] ${c.id} ${c.persona.padEnd(8)} ${c.name.padEnd(40)} ... `);
    try {
      const e = await runCase(c);
      entries[c.id] = e;
      totalIds += e.count;
      const inRange =
        e.count >= c.expected_min_count && e.count <= c.expected_max_count;
      const flag = inRange ? 'OK' : 'WARN';
      console.log(`${flag} count=${e.count} (expected ${c.expected_min_count}~${c.expected_max_count})`);
      if (!inRange) {
        warnings.push(
          `${c.id}: count=${e.count} 범위 벗어남 (expected ${c.expected_min_count}~${c.expected_max_count})`
        );
      }
    } catch (err) {
      console.log('FAIL', err);
      warnings.push(`${c.id}: ${(err as Error).message}`);
    }
  }

  const baseline: Baseline = {
    generated_at: new Date().toISOString(),
    total_cases: cases.length,
    total_ids: totalIds,
    entries,
    warnings,
  };

  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf-8');
  console.log('');
  console.log('[oracle] baseline.json 작성 완료:', baselinePath);
  console.log(`[oracle] 총 케이스: ${cases.length} | 총 ID: ${totalIds} | 경고: ${warnings.length}`);
  if (warnings.length > 0) {
    console.log('[oracle] 경고 목록:');
    warnings.forEach((w) => console.log(