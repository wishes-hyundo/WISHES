/**
 * SSOT Filter Registry v0.1 — PR-A
 *
 * 단일 진실의 근거. type / deal / status 3 개 필터에 대해
 * UI 라벨 + DB 컬럼 + Zod schema + SQL builder + raw→normalized 매퍼를 한 곳에서.
 *
 * RFC: docs/RFC/0002-pr-a-type-normalization.md
 * SQL: docs/migrations/pr_a_type_normalization_2026-04-30.sql
 *
 * 헌법 §77 (PART XII SSOT 형식) + §54 (UI 헌법) + §96 Phase 1.
 *
 * 사용:
 *   import { FILTER_REGISTRY, normalizeType, toDbValues } from '@/filters/registry';
 *
 *   // API endpoint
 *   const dbValues = FILTER_REGISTRY.type.toDbValues(userSelectedTypes);
 *   query.in(FILTER_REGISTRY.type.column, dbValues);
 *
 *   // 클라이언트 fallback (DB trigger 가 미적용된 매물에 대비)
 *   const normalized = normalizeType(rawType);
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────
// §1. type 필터 — 10 종 enum (사장님 결단 2026-04-30)
// ─────────────────────────────────────────────────────────────────────

export const TYPE_NORMALIZED = [
  '원룸',     // newcomer 핵심 (9587 + 551 sub-type 흡수)
  '투룸',     // newcomer 커플 (3874)
  '쓰리룸',   // newcomer 가족 (3012)
  '아파트',   // newlywed 핵심 (227 + 주거용 102 흡수)
  '오피스텔', // 직장인 (692)
  '빌라',     // newlywed 저예산 (329 + 주택 95 흡수)
  '상가',     // business 핵심 (9520 + 이면도로/대로변 18 흡수)
  '사무실',   // business 핵심 (1795 + 사업자등록가능/지식산업센터/주택겸 50+ 흡수)
  '토지',     // 신규 — 투자자 (50)
  '건물',     // 신규 — 통빌딩 매매 (2)
] as const;

export type TypeNormalized = typeof TYPE_NORMALIZED[number];

// raw → normalized 매핑 (DB normalize_type() 함수와 동일 결과)
const TYPE_RAW_TO_NORMALIZED: Record<string, TypeNormalized | null> = {
  // 정상 8 passthrough
  '원룸': '원룸',
  '투룸': '투룸',
  '쓰리룸': '쓰리룸',
  '아파트': '아파트',
  '오피스텔': '오피스텔',
  '빌라': '빌라',
  '상가': '상가',
  '사무실': '사무실',

  // 신규 2
  '토지': '토지',
  '건물': '건물',

  // 사장님 명시: 원룸 계열
  '오픈형원룸': '원룸',
  '분리형원룸': '원룸',
  '주방분리형원룸': '원룸',
  '분리형원룸(1룸 1거실)': '원룸',
  '복층형원룸': '원룸',

  // 사장님 명시: 아파트 계열 (주거용)
  '주거용': '아파트',
  '주거용, 전입신고가능': '아파트',
  '주거용, 사업자등록가능': '아파트',

  // 사장님 명시: 빌라 계열 (주택)
  '주택': '빌라',

  // 사장님 명시: 사무실 계열
  '사업자등록가능': '사무실',
  '지식산업센터': '사무실',
  '사무용': '사무실',
  '사무용, 사업자등록가능': '사무실',
  '주택겸 사무실': '사무실',
  '사업자등록가능, 주택겸 사무실': '사무실',
  '사무실/상가': '사무실',

  // Claude 제안: 상가 계열
  '이면도로': '상가',
  '대로변': '상가',

  // 사장님 결단: NULL + admin 큐
  '확인필요': null,
  '전체': null,
  '전체, 사업자등록가능': null,
};

/**
 * 클라이언트 사이드 정규화 (DB trigger 가 미적용된 매물 대비 fallback).
 * 가능하면 항상 type_normalized 컬럼을 직접 읽는 것이 우선.
 */
export function normalizeType(raw: string | null | undefined): TypeNormalized | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // 직접 매칭 우선
  if (trimmed in TYPE_RAW_TO_NORMALIZED) {
    return TYPE_RAW_TO_NORMALIZED[trimmed];
  }

  // 패턴 매칭 (DB SQL 함수 normalize_type 와 동일 순서 — 헌법 §77 SSOT 단일 진실)
  if (/^(분리형원룸|오픈형원룸|복층형원룸)/.test(trimmed)) return '원룸';
  if (trimmed.startsWith('주거용')) return '아파트';
  // ★ '전체%' 가 '사업자등록가능' wildcard 보다 앞 — '전체, 사업자등록가능' 보호
  if (trimmed.startsWith('전체')) return null;
  if (trimmed.startsWith('사무용') || trimmed.startsWith('주택겸')) return '사무실';
  if (trimmed.includes('사업자등록가능')) return '사무실';

  // 미지의 신규 type — admin 큐로
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// §2. deal 필터 — 3 종 enum
// ─────────────────────────────────────────────────────────────────────

export const DEAL = ['월세', '전세', '매매'] as const;
export type Deal = typeof DEAL[number];

// ─────────────────────────────────────────────────────────────────────
// §3. status 필터 — 3 종 enum (Discovery §2.5 기준)
// ─────────────────────────────────────────────────────────────────────

export const STATUS = ['공개', '비공개', '중복정리'] as const;
export type Status = typeof STATUS[number];

// ─────────────────────────────────────────────────────────────────────
// §4. UI 카테고리 (4 카테고리 → type_normalized 다대일 매핑)
//     CategoryTabs 컴포넌트 라벨은 변경 X (헌법 §54)
// ─────────────────────────────────────────────────────────────────────

export const UI_CATEGORIES = {
  '주거': ['원룸', '투룸', '쓰리룸', '아파트', '오피스텔', '빌라'] as TypeNormalized[],
  '상가': ['상가'] as TypeNormalized[],
  '사무실': ['사무실'] as TypeNormalized[],
  '토지/건물': ['토지', '건물'] as TypeNormalized[],
} as const;

export type UiCategory = keyof typeof UI_CATEGORIES;

// ─────────────────────────────────────────────────────────────────────
// §5. NULL 정책 (PR-B 에서 확장 예정 — Discovery §6.PR-B)
// ─────────────────────────────────────────────────────────────────────

export const NULL_POLICY = {
  type_normalized: {
    user_search: 'exclude',  // 일반 사용자 검색 제외
    admin_queue: 'include',  // admin 큐에 적재
    direct_link: 'include',  // 직접 링크 / 이메일 정상 동작
    status_visible: '공개',  // status 는 그대로 (영업 손실 방지)
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
// §6. SSOT FILTER_REGISTRY — API endpoint 가 import 하는 단일 진실
// ─────────────────────────────────────────────────────────────────────

export const FILTER_REGISTRY = {
  type: {
    column: 'type_normalized' as const,
    legacyColumn: 'type' as const,  // PR-A2 contract 단계까지 dual-write
    enum: TYPE_NORMALIZED,
    zod: z.enum(TYPE_NORMALIZED),
    labels: Object.fromEntries(
      TYPE_NORMALIZED.map(v => [v, v])
    ) as Record<TypeNormalized, string>,
    uiCategories: UI_CATEGORIES,
    rawToNormalized: TYPE_RAW_TO_NORMALIZED,
    normalize: normalizeType,
    nullPolicy: NULL_POLICY.type_normalized,

    /** UI 카테고리(`주거` 등) 또는 정규화 type(`원룸` 등) 입력 → DB 비교용 type_normalized[] 반환 */
    toDbValues(uiValues: readonly string[]): TypeNormalized[] {
      const out = new Set<TypeNormalized>();
      for (const v of uiValues) {
        if (v in UI_CATEGORIES) {
          for (const t of UI_CATEGORIES[v as UiCategory]) out.add(t);
        } else if ((TYPE_NORMALIZED as readonly string[]).includes(v)) {
          out.add(v as TypeNormalized);
        } else {
          // legacy raw type 입력 시 normalize 시도
          const n = normalizeType(v);
          if (n) out.add(n);
        }
      }
      return Array.from(out);
    },

    /** Postgres SQL 빌더 — type_normalized = ANY($1::text[]) */
    sqlIn(values: readonly TypeNormalized[]): { sql: string; params: TypeNormalized[] } {
      return {
        sql: 'type_normalized = ANY($1::text[])',
        params: [...values],
      };
    },
  },

  deal: {
    column: 'deal' as const,
    enum: DEAL,
    zod: z.enum(DEAL),
    labels: { 월세: '월세', 전세: '전세', 매매: '매매' } as Record<Deal, string>,
    sqlIn(values: readonly Deal[]): { sql: string; params: Deal[] } {
      return { sql: 'deal = ANY($1::text[])', params: [...values] };
    },
  },

  status: {
    column: 'status' as const,
    enum: STATUS,
    zod: z.enum(STATUS),
    labels: { 공개: '공개', 비공개: '비공개', 중복정리: '중복정리' } as Record<Status, string>,
    /** 일반 사용자 노출 default — 공개만 */
    publicOnly(): { sql: string; params: Status[] } {
      return { sql: "status = $1", params: ['공개'] };
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
// §7. ESLint custom rule 후보 (별도 파일 도입 예정)
// ─────────────────────────────────────────────────────────────────────
// Forbidden patterns:
//   .eq('type', X)         → use FILTER_REGISTRY.type.column + toDbValues
//   .in('type', X)         → use FILTER_REGISTRY.type.sqlIn
//   .filter('type=eq.X')   → 동일
// → eslint-plugin-wishes/no-raw-type-column rule 작성 (별도 PR-A 후속 작업)

// ─────────────────────────────────────────────────────────────────────
// §8. Re-export 편의
// ─────────────────────────────────────────────────────────────────────

export const toDbValues = FILTER_REGISTRY.type.toDbValues;
export const typeSqlIn = FILTER_REGISTRY.type.sqlIn;
