// L-sec132 (2026-04-23): admin 인증 게이트 회귀 방지 — 토큰 형식 레벨.
//
// DB/JWT 서명 검증 경로는 phase 2 (supabase-js mock) 에서 다룬다.
// 이 테스트는 "토큰이 아예 형식 자체를 못 갖춘 경우 확실히 거절되는가" 에
// 집중 — L-sec2 취약(형식만 보고 통과) 회귀를 차단.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyAdminAuth, verifyAdminAuthStrict } from './adminAuth';

function makeRequest(opts: { authorization?: string; url?: string } = {}) {
  const url = opts.url ?? 'https://wishes.co.kr/api/admin/ping';
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  // Next.js 의 NextRequest 를 직접 생성하기 어려우므로 최소한의 덕타이핑:
  //   verifyAdminAuth 는 request.headers.get / request.url 만 사용.
  return {
    headers,
    url,
  } as any;
}

describe('verifyAdminAuth — token format gating', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // env 에 아무 값도 없으면 getMasterPassword 는 랜덤값 반환 → 실제 토큰은 절대 매칭 불가.
    // 테스트에서는 명시 값 주입.
    process.env.WISHES_ADMIN_MASTER_PASSWORD = 'test-master-password-abcdef';
    delete process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('rejects requests with no Authorization header', async () => {
    const ok = await verifyAdminAuth(makeRequest());
    expect(ok).toBe(false);
  });

  it('rejects empty Bearer', async () => {
    const ok = await verifyAdminAuth(makeRequest({ authorization: 'Bearer  ' }));
    expect(ok).toBe(false);
  });

  it('rejects non-JWT garbage that is NOT the master password', async () => {
    const ok = await verifyAdminAuth(makeRequest({ authorization: 'Bearer totally-not-a-jwt' }));
    expect(ok).toBe(false);
  });

  // NOTE: JWT 경로(eyJ…) 는 supabase.auth.getUser 네트워크 호출을 수반하므로
  //   phase 2 에서 vi.mock('@/lib/supabase', …) 로 stub 한 뒤 커버한다.
  //   phase 1 은 형식만으로 차단되는 경로에 집중.

  it('accepts the master password from env (via timingSafeEqual)', async () => {
    const ok = await verifyAdminAuth(
      makeRequest({ authorization: 'Bearer test-master-password-abcdef' })
    );
    expect(ok).toBe(true);
  });

  it('rejects a near-miss of the master password', async () => {
    const ok = await verifyAdminAuth(
      makeRequest({ authorization: 'Bearer test-master-password-abcdef-X' })
    );
    expect(ok).toBe(false);
  });

  it('admin_bridge_<MASTER> passes; admin_bridge_<wrong> does not', async () => {
    const passing = await verifyAdminAuth(
      makeRequest({ authorization: 'Bearer admin_bridge_test-master-password-abcdef' })
    );
    expect(passing).toBe(true);
    const failing = await verifyAdminAuth(
      makeRequest({ authorization: 'Bearer admin_bridge_wrong-password' })
    );
    expect(failing).toBe(false);
  });
});

describe('verifyAdminAuthStrict — reason codes', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.WISHES_ADMIN_MASTER_PASSWORD = 'test-master-strict-1234567890';
    delete process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns {ok:false, reason:"no_token"} when header missing', async () => {
    const r = await verifyAdminAuthStrict(makeRequest());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_token');
  });

  it('returns {ok:false, reason:"invalid_token_format"} on non-JWT garbage', async () => {
    const r = await verifyAdminAuthStrict(
      makeRequest({ authorization: 'Bearer not-a-jwt' })
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_token_format');
  });

  it('accepts master password directly with role=master', async () => {
    const r = await verifyAdminAuthStrict(
      makeRequest({ authorization: 'Bearer test-master-strict-1234567890' })
    );
    expect(r.ok).toBe(true);
    expect(r.role).toBe('master');
  });
});
