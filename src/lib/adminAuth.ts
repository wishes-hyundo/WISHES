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

// ── 환경변수 기반 시크릿 ────────────────────────────────────────────
// 프로덕션엔 반드시 env 로 설정. 로컬/테스트 환경 편의를 위해
// `NODE_ENV !== 'production'` 일 때만 기존 값('wishes2026')을 fallback 한다.
function getMasterPassword(): string {
  const env = process.env.WISHES_ADMIN_MASTER_PASSWORD;
  if (env && env.length >= 6) return env;
  if (process.env.NODE_ENV !== 'production') return 'wishes2026';
  // 프로덕션에서 env 가 없으면 랜덤 문자열 반환 → 사실상 차단
  return '__UNSET_ADMIN_PASSWORD_' + Math.random();
}

function getCrawlerBridgeToken(): string | null {
  const env = process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
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

  if (!token) return false;

  const MASTER_PASSWORD = getMasterPassword();
  const CRAWLER_BRIDGE = getCrawlerBridgeToken();

  // 1) 마스터 패스워드
  if (token === MASTER_PASSWORD) return true;

  // 2) 크롤러 브리지 (env)
  if (CRAWLER_BRIDGE && token === CRAWLER_BRIDGE) return true;

  // 3) admin_bridge_<inner> — inner 가 env 토큰과 정확히 일치해야 함
  if (token.startsWith('admin_bridge_')) {
    const inner = token.slice('admin_bridge_'.length);
    if (CRAWLER_BRIDGE && inner === CRAWLER_BRIDGE) return true;
    if (inner === MASTER_PASSWORD) return true;
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

    const { data, error } = await Promise.race([
      supabase.auth.getUser(token),
      new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      ),
    ]) as { data: { user: any }; error: any };

    if (error || !data?.user) return false;

    const email = (data.user.email || '').toLowerCase();

    // 슈퍼어드민 즉시 통과
    if (SUPERADMIN_EMAILS.includes(email)) return true;

    // admin_users 테이블에서 role/status 조회
    const { data: adminUser } = await Promise.race([
      supabase
        .from('admin_users')
        .select('role, status')
        .or(`id.eq.${data.user.id},email.eq.${email}`)
        .limit(1)
        .maybeSingle(),
      new Promise<{ data: null }>((_, reject) =>
        setTimeout(() => reject(new Error('db_timeout')), 3000)
      ),
    ]) as { data: { role?: string; status?: string } | null };

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
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  if (!token) {
    try {
      const { searchParams } = new URL(request.url);
      const queryToken = searchParams.get('token');
      if (queryToken && queryToken === getMasterPassword()) {
        return { ok: true, role: 'master' };
      }
    } catch { /* noop */ }
    return { ok: false, reason: 'no_token' };
  }

  // 마스터 패스워드 (env)
  const MASTER_PASSWORD = getMasterPassword();
  if (token === MASTER_PASSWORD) return { ok: true, role: 'master' };

  // 크롤러 브리지 토큰 (env 완전 일치)
  const CRAWLER_BRIDGE = getCrawlerBridgeToken();
  if (CRAWLER_BRIDGE && token === CRAWLER_BRIDGE) {
    return { ok: true, role: 'crawler_bridge' };
  }

  // JWT 서명 검증
  if (!token.startsWith('eyJ') || token.split('.').length !== 3) {
    return { ok: false, reason: 'invalid_token_format' };
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await Promise.race([
      supabase.auth.getUser(token),
      new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      ),
    ]) as { data: { user: any }; error: any };

    if (error || !data?.user) {
      return { ok: false, reason: 'jwt_verification_failed' };
    }

    const email = (data.user.email || '').toLowerCase();

    // 슈퍼어드민 즉시 통과
    if (SUPERADMIN_EMAILS.includes(email)) {
      return { ok: true, email, role: 'superadmin' };
    }

    // admin_users 테이블에서 role/status 조회
    const { data: adminUser } = await Promise.race([
      supabase
        .from('admin_users')
        .select('role, status')
        .or(`id.eq.${data.user.id},email.eq.${email}`)
        .limit(1)
        .maybeSingle(),
      new Promise<{ data: null }>((_, reject) =>
        setTimeout(() => reject(new Error('db_timeout')), 3000)
      ),
    ]) as { data: { role?: string; status?: string } | null };

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
