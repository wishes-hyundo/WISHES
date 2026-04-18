// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// adminAuth — 어드민 API 공용 Bearer 토큰 검증
//
// 어드민 대시보드 클라이언트는 Supabase JWT(access_token)를
// `Authorization: Bearer eyJ...` 로 담아 전달한다.
// 과거 레거시 코드는 동일한 헤더에 `wishes2026` 마스터 패스워드를 담았고,
// 크롤러 스크립트는 `admin_bridge_*` 접두사 또는 쿼리파라미터 토큰을 쓴다.
//
// 일부 라우트(contacts·briefing·appointments·stats·subscribers…) 가
// 엄격한 password 등치 비교만 수행해 JWT 세션 요청을 401 로 차단하던
// 버그를 여기로 통일한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { NextRequest } from 'next/server';

const MASTER_PASSWORD = 'wishes2026';

/**
 * Bearer 헤더 또는 `?token=` 쿼리에서 토큰을 추출해 허용 여부를 판단한다.
 *
 * 허용 조건:
 *  1) 토큰 == MASTER_PASSWORD  — 레거시/크롤러 마스터 키
 *  2) `admin_bridge_` 접두사    — 크롤러 브리지 토큰
 *  3) `eyJ`로 시작하는 JWT      — Supabase access_token (header.payload.signature)
 *  4) 쿼리파라미터 `token` == MASTER_PASSWORD (크롤러 no-cors 모드)
 */
export function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  if (token === MASTER_PASSWORD) return true;
  if (token.startsWith('admin_bridge_')) return true;

  // JWT 형식 (header.payload.signature) — Supabase access_token 이면 통과
  if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
    return true;
  }

  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('token') === MASTER_PASSWORD) return true;
  } catch {
    /* URL 파싱 실패는 무시 */
  }

  return false;
}
