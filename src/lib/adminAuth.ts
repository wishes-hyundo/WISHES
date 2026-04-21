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
//   - 기존 verifyAdminAuth() 는 하위 호환 유지 (후속 PR 에서 제거)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { NextRequest } from 'next/server';
import { createServerClient } from './supabase';

// ── 환경변수 기반 시크릿 ────────────────────────────────────────
// 프로덕션에선 반드시 env 로 설정. 로컬/테스트 환경 편의를 위해
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

// ─── 하위 호환 동기 검증기 ───────────────────────────────────────
/**
 * Bearer 헤더 또는 `?token=` 쿼리에서 토큰을 추출해 허용 여부를 판단한다.
 *
 * 허용 조건:
 *  1) 토큰 == MASTER_PASSWORD  — 레거시/크롤러 마스터 키
 *  2) `admin_bridge_*` 전체가 WISHES_CRAWLER_BRIDGE_TOKEN 과 일치 (env 설정 시)
 *  3) `eyJ`로 시작하는 JWT 형식   — Supabase access_token (header.payload.signature)
 *     ※ 서명까진 검증하지 않음. 강한 검증은 verifyAdminAuthStrict() 사용.
 *  4) 쿼리파라미터 `token` == MASTER_PASSWORD
 *
 * #101 NOTE : 이 함수는 하위 호환용이며 변이성 엔드포인트는
 *             verifyAdminAuthStrict() 로 점진적 전환 중이다.
 */
export function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  const MASTER_PASSWORD = getMasterPassword();
  if (token && token === MASTER_PASSWORD) return true;

  const CRAWLER_BRIDGE = getCrawlerBridgeToken();
  if (CRAWLER_BRIDGE && token === CRAWLER_BRIDGE) return true;

  // JWT 형식 (header.payload.signature) — Supabase access_token 이면 통과
  // ※ 서명 검증은 여기서 못하므로 유의 (strict 버전 참고)
  if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
    return true;
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    if (queryToken && queryToken === MASTER_PASSWORD) return true;
  } catch {
    /* URL 파싱 실패는 무시 */
  }

  return false;
}

// ─── 강력 검증기 (#101 신규) ────────────────────────────────────
/**
 * JWT 서명 검증 + admin_users.role/status 체크까지 수행하는 엄격 버전.
 *
 * 반환값 :
 *   - `ok: true` + 검증된 이메일/role
 *   - `ok: false` + 이유 (로그용)
 *
 * 사용처 (순차 전환 예정):
 *   - DELETE / bulk-delete / field-update / migrate / apply-migration
 *   - dedup/hide · dedup/restore · dedup/cleanup
 *   - users (계정 승인/반려)
 *   - upload · upload-video · migrate-to-r2
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

    const role = adminUser?.role || data.user.user_metadata?.role || '';
    const status = adminUser?.status || data.user.user_metadata?.status || '';

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
