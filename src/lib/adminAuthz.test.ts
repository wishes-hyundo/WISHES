// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// H-4 phase 2 (2026-04-23): adminAuthz IDOR 가드 회귀 테스트.
//
// 목적:
//   L-sec136 (A-crit-2) 에서 bulk delete/update/field-update 가 다른 중개사
//   매물을 대량 조작 가능했던 이슈를 닫았음. 회귀 락이 없으면 다음 리팩터
//   한 번에 원본 ids 를 그대로 .in() 에 넣는 실수가 재발할 수 있음.
//
//   이 테스트는 adminAuthz 의 순수 로직 (role 분기, created_by 매칭, bypassed
//   플래그, filteredOut 집합) 을 supabase 모킹으로 고정한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./adminAuth', () => ({
  verifyAdminAuthWithContext: vi.fn(),
}));

import { verifyAdminAuthWithContext } from './adminAuth';
import {
  authorizeListingMutation,
  authorizeBulkListingMutation,
} from './adminAuthz';

const mockVerify = verifyAdminAuthWithContext as unknown as ReturnType<typeof vi.fn>;

function makeSupabase(ownedByCreator: Record<number, string | null>) {
  return {
    from: (_tbl: string) => ({
      select: (_cols: string) => {
        const builder: any = {
          _id: null as number | null,
          _ids: null as number[] | null,
          _createdBy: null as string | null,
          eq(col: string, val: any) {
            if (col === 'id') this._id = Number(val);
            if (col === 'created_by') this._createdBy = val as string;
            return this;
          },
          in(col: string, vals: any[]) {
            if (col === 'id') this._ids = (vals as any[]).map((v) => Number(v));
            return this;
          },
          async maybeSingle() {
            const id = this._id;
            if (id === null || !(id in ownedByCreator)) {
              return { data: null, error: null };
            }
            return { data: { created_by: ownedByCreator[id] }, error: null };
          },
          then(resolve: (v: any) => void) {
            const ids: number[] = this._ids || [];
            const createdBy: string | null = this._createdBy;
            const rows = ids
              .filter((id: number) => id in ownedByCreator)
              .filter((id: number) =>
                createdBy === null ? true : ownedByCreator[id] === createdBy,
              )
              .map((id: number) => ({ id }));
            resolve({ data: rows, error: null });
          },
        };
        return builder;
      },
    }),
  } as any;
}

function fakeRequest() {
  return { headers: new Headers(), url: 'https://wishes.co.kr/api/admin/x' } as any;
}

describe('authorizeListingMutation — single IDOR guard', () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it('401 when token missing', async () => {
    mockVerify.mockResolvedValue({ ok: false });
    const r = await authorizeListingMutation(fakeRequest(), 1, makeSupabase({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it.each(['master', 'superadmin', 'crawler_bridge'])(
    'ALLOWS unlimited role %s without created_by check',
    async (role) => {
      mockVerify.mockResolvedValue({ ok: true, role, email: 'x@x.io', uid: 'u-x' });
      const r = await authorizeListingMutation(fakeRequest(), 9999, makeSupabase({}));
      expect(r.ok).toBe(true);
    },
  );

  it('403 when agent has no uid', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', email: 'a@x.io' });
    const r = await authorizeListingMutation(fakeRequest(), 1, makeSupabase({ 1: 'u-1' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('404 when listing not found', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeListingMutation(fakeRequest(), 404, makeSupabase({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it('403 when agent is NOT the creator', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeListingMutation(
      fakeRequest(),
      7,
      makeSupabase({ 7: 'u-other' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('403 when created_by is NULL (legacy — agent blocked)', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeListingMutation(fakeRequest(), 8, makeSupabase({ 8: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('OK when agent IS the creator', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeListingMutation(
      fakeRequest(),
      42,
      makeSupabase({ 42: 'u-me' }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('authorizeBulkListingMutation — bulk IDOR guard', () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it('401 when token missing', async () => {
    mockVerify.mockResolvedValue({ ok: false });
    const r = await authorizeBulkListingMutation(fakeRequest(), [1, 2, 3], makeSupabase({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('unlimited role passes ALL ids untouched with bypassed=true', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'master', email: 'm@x.io', uid: 'u-m' });
    const ids = [10, 20, 30, 40];
    const r = await authorizeBulkListingMutation(
      fakeRequest(),
      ids,
      makeSupabase({ 10: 'someone-else', 20: null }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bypassed).toBe(true);
      expect(r.ownedIds).toEqual(ids);
      expect(r.filteredOut).toEqual([]);
    }
  });

  it('empty input short-circuits', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeBulkListingMutation(fakeRequest(), [], makeSupabase({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownedIds).toEqual([]);
      expect(r.bypassed).toBe(false);
    }
  });

  it('agent receives ONLY owned ids; others go to filteredOut', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const supa = makeSupabase({
      10: 'u-me',
      20: 'u-me',
      30: 'u-other',
      40: null,
      50: 'u-me',
    });
    const r = await authorizeBulkListingMutation(
      fakeRequest(),
      [10, 20, 30, 40, 50, 9999],
      supa,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownedIds.sort()).toEqual([10, 20, 50].sort());
      expect(r.filteredOut.sort()).toEqual([30, 40, 9999].sort());
      expect(r.bypassed).toBe(false);
    }
  });

  it('CRITICAL regression: no owned ids returns empty ownedIds (not the input)', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const requested = [1, 2, 3, 4];
    const r = await authorizeBulkListingMutation(
      fakeRequest(),
      requested,
      makeSupabase({ 1: 'u-other', 2: 'u-other', 3: null, 4: null }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownedIds).toEqual([]);
      expect(r.filteredOut.sort()).toEqual(requested.slice().sort());
      expect(r.bypassed).toBe(false);
    }
  });

  it('preserves duplicate ids if caller passes them in (caller is responsible for dedup)', async () => {
    mockVerify.mockResolvedValue({ ok: true, role: 'agent', uid: 'u-me', email: 'me@x.io' });
    const r = await authorizeBulkListingMutation(
      fakeRequest(),
      [1, 1, 2],
      makeSupabase({ 1: 'u-me', 2: 'u-me' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 가드는 dedup 책임을 지지 않음 — 원본 순서/중복 유지.
      // 이 동작은 의도된 것이므로 회귀 락으로 박제. 변경 필요시 별도 commit 에서.
      expect(r.ownedIds).toEqual([1, 1, 2]);
    }
  });

  it('master that loses role mid-session (becomes agent) switches to filtering', async () => {
    // 같은 supabase 인스턴스, 다른 request 두 번 호출.
    mockVerify
      .mockResolvedValueOnce({ ok: true, role: 'master', email: 'm@x.io', uid: 'u-m' })
      .mockResolvedValueOnce({ ok: true, role: 'agent', uid: 'u-m', email: 'm@x.io' });
    const supa = makeSupabase({ 1: 'u-other', 2: 'u-m' });
    const r1 = await authorizeBulkListingMutation(fakeRequest(), [1, 2], supa);
    const r2 = await authorizeBulkListingMutation(fakeRequest(), [1, 2], supa);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.bypassed).toBe(true);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.bypassed).toBe(false);
      expect(r2.ownedIds).toEqual([2]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 설계 메모 (회귀 시 참조):
//
// 이 파일이 깨지는 상황:
//   1. adminAuthz.ts 에서 UNLIMITED_ROLES 집합이 변경됨 (기대: master/superadmin/
//      crawler_bridge 3개). 4번째 role 이 추가되면 unlimited 테스트 실패.
//   2. authorizeBulkListingMutation 이 ownedIds 대신 ids 를 그대로 반환하는
//      회귀 — CRITICAL regression 테스트가 감지.
//   3. agent uid null 인 경로에서 403 대신 200 을 반환하는 회귀.
//   4. listing 존재 여부 체크 누락 (404 대신 403 반환하는 식) — 단건 단위 테스트가 감지.
//
// 추후 phase 2b:
//   - NextRequest 타입 그대로 쓰는 정식 하네스 (현재는 duck-type 으로 충분).
//   - contacts / appointments PATCH 의 listing_id 역조회 경로 통합 테스트.
//   - bulk-delete / bulk-update / field-update 의 ownedIds 재사용 경로 통합 테스트.
// ─────────────────────────────────────────────────────────────────────────
