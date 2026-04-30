// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) tests/setup.ts — 회귀 안전망 베이스라인 (§125)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 단계 2: supabase mock helper export
// 단계 4 (이번): msw setupServer 활성 — Golden 50 핸들러 부착
// 단계 5 (예정): SQL Oracle 검증 시 supabase service-role 별도 client
// 단계 6 (예정): DOM Snapshot — happy-dom / jsdom 환경으로 별도 분리 가능
//
// 주의:
//   - 본 파일은 "module-load-time" setup 만 담당 (mock helper export 만)
//   - 실제 supabase 호출 mock 은 각 테스트에서 vi.mock('@/lib/supabase', …)
//   - top-level await 금지 (vitest setup 호환성)

import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { goldenHandlers } from './golden/handlers';

// ──────────────────────────────────────────
// msw setupServer (PR-E 단계 4 — Golden 50)
// ──────────────────────────────────────────
//
// goldenHandlers 는 tests/golden/handlers.ts 에서 export.
// 각 핸들러는 msw v2 http.* API. 추가 핸들러는 단계 5 / 6 / 7 에서 보강.
export const mswServer = setupServer(...goldenHandlers);

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});

/**
 * Supabase Postgrest Builder 형태의 chainable mock 생성.
 *
 * 사용 예:
 * ```ts
 * import { createSupabasePostgrestMock } from '../setup';
 *
 * vi.mock('@/lib/supabase', () => ({
 *   supabase: createSupabasePostgrestMock([
 *     { id: 1, title: '신림 투룸' },
 *   ]),
 * }));
 * ```
 *
 * 단계 4 (Golden 50) 에서 핸들러 다양화. 단계 2 는 sanity 만 검증.
 */
export function createSupabasePostgrestMock<T = unknown>(rows: T[] = []) {
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    like: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    overlaps: vi.fn(() => builder),
    range: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: T[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

/**
 * Listing 객체 fixture 생성 헬퍼.
 *
 * 베이스라인 테스트에서 결정적 입력을 만들 때 사용.
 * 단계 4 에서 사회초년생/신혼부부/사업자 케이스 별 fixture 분기 추가 예정.
 */
export function createListingFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 99999,
    title: '베이스라인 fixture',
    type: '원룸',
    deal: '월세',
    deposit: 1000,
    monthly: 50,
    price: null,
    area_m2: 33,
    floor_current: '3',
    floor_total: '5',
    rooms: 1,
    bathrooms: 1,
    address: '서울 관악구 신림동',
    lat: 37.4842,
    lng: 126.9295,
    status: '공개',
    ...overrides,
  };
}

// ──────────────────────────────────────────
// 단계 5 추가 예정 (SQL Oracle):
//   import { Pool } from 'pg' — service-role 별도 client
//   각 Golden 케이스 sql_oracle 직접 실행 → ID 집합 박제
// 단계 6 (DOM Snapshot):
//   environment 'happy-dom' 별도 vitest config 분리 가능
// ──────────────────────────────────────────
