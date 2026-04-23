// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// adminAuth — 어드민 API 공용 Bearer 토큰 검증
//
// 어드민 대시보드 클라이언트는 Supabase JWT(access_token)를
// `Authorization: Bearer eyJ...` 로 담아 전달한다.
// 과거 레거시 코드는 동일한 헤더에 마스터 패스워드를 담았고,
// 크롤러 스크립트는 `admin_bridge_*` 접두사 또는 쿼리파라미터 토큰을 쓴다.
//
// ─── #101 (2026-04-21) 어드민 세션 감사 ───
//   - MASTER_PASSWORD 를 env 로 이전 (소스 박제 제거)
//   - admin_bridge_ 접두사를 env 등치 비교로 전환
//   - verifyAdminAuthStrict() 신설 — JWT 서명 검증 + role/status 체크
//
// ─── #L-sec2 (2026-04-22) verifyAdminAuth JWT 서명 미검증 취약 수정 ───
//   - 과거 동기 verifyAdminAuth() 는 JWT 형식(eyJ + dots)만 보고 통과시켜
//     임의의 access_token 혹은 직접 구성한 base64 문자열로도 admin 통과.
//   - async 로 전환하고 supabase.auth.getUser() 서명 검증 + admin_users role/status 체크.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { NextRequest } from 'next/server';
import { createServerClient } from './supabase';
import { timingSafeEqualStr } from './timingSafe';


// ─── L-sec166 (2026-04-23): Supabase 요청 timeout + retry helper ───
//   기존엔 Promise.race 로 단순 3초 timeout 만 걸어서 DB 일시적 지연이 있으면
//   바로 false → 401 → agent bounce. 1회 exponential backoff 로 흡수.
async function withRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retries: number = 1,
  baseBackoffMs: number = 400,
  timeoutMsg: string = 'timeout',
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs),
        ),
      ]);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseBackoffMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ── 환경변수 기반 시크릿 ───────────────────────────────────────────
// WISHES_ADMIN_MASTER_PASSWORD 는 모든 환경(prod/preview/local dev) 공통 필수.
// 미설정 시 즉시 무효화 값으로 fallback → admin 경로 자동 차단.
//
// ─── L-sec89 (2026-04-22) 하드코드 dev fallback 제거 ───
//   과거엔 `NODE_ENV !== 'production'` 분기에서 'wishes2026' 박제 문자열을
//   그대로 반환했다. 로컬 `npm run dev` 환경에서는 편의였지만:
//     1) 저장소 소스 자체에 유명 패스워드가 박제되어 있어 패턴 누출 리스크
//     2) 관리 서버의 NODE_ENV 를 실수로 development 로 띄우면 바로 취약
//     3) 코드-리뷰 시 '정말 제거됐는지' 반복 검증 부담
//   → env 하나에 모든 환경이 의존하도록 일원화.
//   → 로컬 개발자는 `.env.local` 에 WISHES_ADMIN_MASTER_PASSWORD 를 설정해야 함.
function getMasterPassword(): string {
  const env = process.env.WISHES_ADMIN_MASTER_PASSWORD;
  if (env && env.length >= 6) return env;
  // env 미설정 → 랜덤 문자열 반환해 timingSafeEqualStr 를 사실상 통과 불가로 만들.
  // (매 호출마다 값이 달라지므로 토큰 비교는 항상 실패.)
  return '__UNSET_ADMIN_PASSWORD_' + Math.random();
}

function getCrawlerBridgeToken(): string | null {
  const env = process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
  return env && env.length >= 16 ? env : null;
}

// L-sec156 (2026-04-23, Phase 3a): WISHES_INTERNAL_BEARER 도입.
//   지금까지는 내부 자가호출(auto-generate-bulk → auto-generate,
//   generate-description, building-registry-full → building-registry) 이
//   WISHES_ADMIN_MASTER_PASSWORD 를 Bearer 로 재사용해 master 롤로 통과했다.
//   마스터 패스워드는 사람(슈퍼어드민) 이 공유·입력하는 운영 토큰과 의미가
//   겹쳐서, 한 값이 노출되면 내부 배치 + 어드민 마스터 키가 동시에 털린다.
//   Phase 3a 에서는 '내부 자가호출 전용' 의미를 갖는 새 env 를 병행 수신하도록
//   추가하고, Phase 3b 에서 3개 self-call 사이트를 새 env 로 교체, Phase 3c
//   (L-sec158) 에서 MASTER_PASSWORD accept path 를 완전 제거할 예정.
//
//   길이 16자 이상만 유효. 미설정 시 검증 실패 (env 가 없으면 경로 OFF).
function getInternalBearer(): string | null {
  const env = process.env.WISHES_INTERNAL_BEARER;
  return env && env.length >= 16 ? env : null;
}

// 슈퍼어드민 이메일 — JWT 검증 통과 시 추가 역할 확인 면제
const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// 어드민 role 화이트리스트
const ADMIN_ROLES = new Set(['superadmin', 'admin', 'agent']);

// ─── 공용 검증기 (#L-sec2 이후, async) ────────────────────────
/**
 * Bearer 헤더 또는 `?token=` 쿼리에서 토큰을 추출해 허용 여부를 판단한다.
 *
 * 허용 조건:
 *  1) 토큰 == MASTER_PASSWORD (env)                — 운영 마스터 키
 *  2) 토큰 == WISHES_CRAWLER_BRIDGE_TOKEN (env)    — 크롤러 전용 브리지
 *  3) `admin_bridge_<inner>` 에서 inner 가 위 2) 와 정확히 일치
 *  4) JWT (eyJ…)                                    — 서명 검증 통과 + 어드민 role/status
 *  5) 쿼리파라미터 `token` == MASTER_PASSWORD
 *
 * ─── #L-sec2 (2026-04-22) ───
 * 과거 동기 버전은 JWT 의 '형식' 만 확인하고 서명 검증을 생략해서,
 * 임의 계정의 access_token 혹은 직접 구성한 base64 문자열로도 어드민 API 를
 * 통과시켰다. 본 함수를 async 로 전환하고 supabase.auth.getUser() 로
 * 서명을 검증한 뒤 admin_users.role/status 까지 확인한다.
 * 동기 호출 지점은 `await verifyAdminAuth(request)` 로 일괄 전환됐다.
 */
export async function verifyAdminAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  let token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  // 쿼리 fallback (GET 기반 크롤러 스크립트 호환)
  if (!token) {
    try {
      const { searchParams } = new URL(request.url);
      token = (searchParams.get('token') || '').trim();
    } catch { /* noop */ }
  }

  // L-sec133 (2026-04-23, C-2 phase 1): HttpOnly 쿠키(ws_session) fallback.
  //   /api/auth/cookie-issue 로 발급된 쿠키를 읽어 기존 Bearer 경로와 병행.
  //   phase 1 의 의도: 기존 Bearer 를 사용하는 모든 클라이언트는 변동 없이
  //   작동하되, 쿠키 기반으로 새로 접근한 요청도 통과하게 한다.
  //   phase 2 에서 클라이언트가 쿠키 전용 fetch 로 전환되면 이 블록이 주 경로가 됨.
  if (!token) {
    try {
      const cookieToken = request.cookies?.get?.('ws_session')?.value?.trim();
      if (cookieToken) token = cookieToken;
    } catch { /* noop */ }
  }

  if (!token) return false;

  const MASTER_PASSWORD = getMasterPassword();
  const CRAWLER_BRIDGE = getCrawlerBridgeToken();
  const INTERNAL_BEARER = getInternalBearer();

  // 1) 마스터 패스워드 (Phase 3c 에서 제거 예정)
  if (timingSafeEqualStr(token, MASTER_PASSWORD)) return true;

  // 1b) 내부 자가호출 베어러 (L-sec156, Phase 3a 병행)
  if (INTERNAL_BEARER && timingSafeEqualStr(token, INTERNAL_BEARER)) return true;

  // 2) 크롤러 브리지 (env)
  if (CRAWLER_BRIDGE && timingSafeEqualStr(token, CRAWLER_BRIDGE)) return true;

  // 3) admin_bridge_<inner> — inner 가 env 토큰과 정확히 일치해야 함
  if (token.startsWith('admin_bridge_')) {
    const inner = token.slice('admin_bridge_'.length);
    if (CRAWLER_BRIDGE && timingSafeEqualStr(inner, CRAWLER_BRIDGE)) return true;
    if (timingSafeEqualStr(inner, MASTER_PASSWORD)) return true;
    if (INTERNAL_BEARER && timingSafeEqualStr(inner, INTERNAL_BEARER)) return true;
    // inner 가 JWT 인 경우 (슈퍼어드민이 브리지 경유 시) 아래 JWT 경로로 falls through
    token = inner;
  }

  // 4) JWT 서명 검증 + admin_users role/status 체크
  if (!(token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40)) {
    return false;
  }

  try {
    const supabase = createServerClient();
    if (!supabase) return false;

    const { data, error } = await withRetry(
      () => supabase.auth.getUser(token),
      3000,
      1,
    ) as { data: { user: any }; error: any };

    if (error || !data?.user) return false;

    const email = (data.user.email || '').toLowerCase();

    // 슈퍼어드민 즉시 통과
    if (SUPERADMIN_EMAILS.includes(email)) return true;

    // admin_users 테이블에서 role/status 조회
    const { data: adminUser } = await withRetry(
      () => supabase
        .from('admin_users')
        .select('role, status')
        .or(`id.eq.${data.user.id},email.eq.${email}`)
        .limit(1)
        .maybeSingle(),
      3000,
      1,
      400,
      'db_timeout',
    ) as { data: { role?: string; status?: string } | null };

    // L-sec59 (2026-04-22): CRITICAL privilege escalation fix.
    //   user_metadata 는 supabase.auth.updateUser({data:...}) 로 사용자 본인이
    //   자유롭게 수정 가능. role='admin'/status='approved' 를 스스로 설정한 뒤
    //   admin_users 레코드가 없는 채로 /api/admin/* 를 호출하면 user_metadata
    //   fallback 경로로 어드민 통과. → admin_users 테이블 row 만 신뢰.
    const role = adminUser?.role || '';
    const status = adminUser?.status || '';

    return status === 'approved' && ADMIN_ROLES.has(role);
  } catch {
    return false;
  }
}

// ─── 컨텍스트 검증기 (L-sec112 IDOR 방어용, 2026-04-22 재적용) ────────
/**
 * verifyAdminAuth 와 동일한 인증 경로를 타되, 성공 시 호출자의 신원
 * (uid/email/role)까지 반환한다. listings/[id] DELETE/PATCH 같은 IDOR
 * 방어에서 "본인 매물만 변경" 체크를 하려면 단순 boolean 으론 부족.
 *
 * 반환:
 *   { ok:true, role:'master' }                                 — env 마스터 패스워드
 *   { ok:true, role:'crawler_bridge' }                         — 크롤러 브리지
 *   { ok:true, role:'superadmin'|'admin'|'agent', uid, email } — JWT 경유
 *   { ok:false }                                               — 실패
 */
export async function verifyAdminAuthWithContext(request: NextRequest): Promise<{
  ok: boolean;
  uid?: string;
  email?: string;
  role?: string;
}> {
  const authHeader = request.headers.get('authorization');
  let token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  if (!token) {
    try {
      const { searchParams } = new URL(request.url);
      token = (searchParams.get('token') || '').trim();
    } catch { /* noop */ }
  }

  // L-sec133 (2026-04-23, C-2 phase 1): ws_session 쿠키 fallback (IDOR 경로 동일).
  if (!token) {
    try {
      const cookieToken = request.cookies?.get?.('ws_session')?.value?.trim();
      if (cookieToken) token = cookieToken;
    } catch { /* noop */ }
  }

  if (!token) return { ok: false };

  const MASTER_PASSWORD = getMasterPassword();
  const CRAWLER_BRIDGE = getCrawlerBridgeToken();
  const INTERNAL_BEARER = getInternalBearer();

  if (timingSafeEqualStr(token, MASTER_PASSWORD)) return { ok: true, role: 'master' };
  if (INTERNAL_BEARER && timingSafeEqualStr(token, INTERNAL_BEARER)) {
    return { ok: true, role: 'internal_bearer' };
  }
  if (CRAWLER_BRIDGE && timingSafeEqualStr(token, CRAWLER_BRIDGE)) {
    return { ok: true, role: 'crawler_bridge' };
  }

  if (token.startsWith('admin_bridge_')) {
    const inner = token.slice('admin_bridge_'.length);
    if (CRAWLER_BRIDGE && timingSafeEqualStr(inner, CRAWLER_BRIDGE)) {
      return { ok: true, role: 'crawler_bridge' };
    }
    if (timingSafeEqualStr(inner, MASTER_PASSWORD)) return { ok: true, role: 'master' };
    if (INTERNAL_BEARER && timingSafeEqualStr(inner, INTERNAL_BEARER)) {
      return { ok: true, role: 'internal_bearer' };
    }
    token = inner;
  }

  if (!(token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40)) {
    return { ok: false };
  }

  try {
    const supabase = createServerClient();
    if (!supabase) return { ok: false };

    const { data, error } = await withRetry(
      () => supabase.auth.getUser(token),
      3000,
      1,
    ) as { data: { user: any }; error: any };

    if (error || !data?.user) return { ok: false };

    const email = (data.user.email || '').toLowerCase();
    const uid = data.user.id;

    if (SUPERADMIN_EMAILS.includes(email)) {
      return { ok: true, uid, email, role: 'superadmin' };
    }

    const { data: adminUser } = await withRetry(
      () => supabase
        .from('admin_users')
        .select('role, status')
        .or(`id.eq.${uid},email.eq.${email}`)
        .limit(1)
        .maybeSingle(),
      3000,
      1,
      400,
      'db_timeout',
    ) as { data: { role?: string; status?: string } | null };

    const role = adminUser?.role || '';
    const status = adminUser?.status || '';

    if (status !== 'approved' || !ADMIN_ROLES.has(role)) return { ok: false };

    return { ok: true, uid, email, role };
  } catch {
    return { ok: false };
  }
}

// ─── 강력 검증기 (#101 신규) ───────────────────────────────────────
/**
 * JWT 서명 검증 + admin_users.role/status 체크까지 수행하는 엄격 버전.
 *
 * 반환값 :
 *   - `ok: true` + 검증된 이메일/role
 *   - `ok: false` + 이유 (로그용)
 *
 * 하위 호환 : MASTER_PASSWORD / CRAWLER_BRIDGE_TOKEN 도 동일하게 통과시킨다
 * (env 기반이므로 박제 문제 없음).
 */
export async function verifyAdminAuthStrict(request: NextRequest): Promise<{
  ok: boolean;
  reason?: string;
  email?: string;
  role?: string;
}> {
  const authHeader = request.headers.get('authorization');
  let token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  if (!token) {
    try {
      const { searchParams } = new URL(request.url);
      const queryToken = searchParams.get('token');
      if (queryToken && timingSafeEqualStr(queryToken, getMasterPassword())) {
        return { ok: true, role: 'master' };
      }
    } catch { /* noop */ }
    // L-sec133 (2026-04-23, C-2 phase 1): ws_session 쿠키 fallback.
    //   query token 이 마스터와 일치하지 않아도 쿠키가 있으면 JWT 경로로 진행.
    try {
      const cookieToken = request.cookies?.get?.('ws_session')?.value?.trim();
      if (cookieToken) token = cookieToken;
    } catch { /* noop */ }
    if (!token) return { ok: false, reason: 'no_token' };
  }

  // 마스터 패스워드 (env, L-sec158 에서 제거 예정)
  const MASTER_PASSWORD = getMasterPassword();
  if (timingSafeEqualStr(token, MASTER_PASSWORD)) return { ok: true, role: 'master' };

  // 내부 자가호출 베어러 (L-sec156 Phase 3a — master 경로 대체 목표)
  const INTERNAL_BEARER = getInternalBearer();
  if (INTERNAL_BEARER && timingSafeEqualStr(token, INTERNAL_BEARER)) {
    return { ok: true, role: 'internal_bearer' };
  }

  // 크롤러 브리지 토큰 (env 완전 일치)
  const CRAWLER_BRIDGE = getCrawlerBridgeToken();
  if (CRAWLER_BRIDGE && timingSafeEqualStr(token, CRAWLER_BRIDGE)) {
    return { ok: true, role: 'crawler_bridge' };
  }

  // JWT 서명 검증
  if (!token.startsWith('eyJ') || token.split('.').length !== 3) {
    return { ok: false, reason: 'invalid_token_format' };
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await withRetry(
      () => supabase.auth.getUser(token),
      3000,
      1,
    ) as { data: { user: any }; error: any };

    if (error || !data?.user) {
      return { ok: false, reason: 'jwt_verification_failed' };
    }

    const email = (data.user.email || '').toLowerCase();

    // 슈퍼어드민 즉시 통과
    if (SUPERADMIN_EMAILS.includes(email)) {
      return { ok: true, email, role: 'superadmin' };
    }

    // admin_users 테이블에서 role/status 조회
    const { data: adminUser } = await withRetry(
      () => supabase
        .from('admin_users')
        .select('role, status')
        .or(`id.eq.${data.user.id},email.eq.${email}`)
        .limit(1)
        .maybeSingle(),
      3000,
      1,
      400,
      'db_timeout',
    ) as { data: { role?: string; status?: string } | null };

    // L-sec59 (2026-04-22): user_metadata fallback 제거 (self-escalation 차단)
    const role = adminUser?.role || '';
    const status = adminUser?.status || '';

    if (status !== 'approved') {
      return { ok: false, reason: 'not_approved', email, role };
    }
    if (!ADMIN_ROLES.has(role)) {
      return { ok: false, reason: 'insufficient_role', email, role };
    }

    return { ok: true, email, role };
  } catch (err: any) {
    return { ok: false, reason: 'exception:' + (err?.message || 'unknown') };
  }
}
