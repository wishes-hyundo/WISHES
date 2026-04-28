// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// csrf.ts — C-2 phase 2 (L-sec142, 2026-04-23)
//
// Double-submit CSRF 토큰 유틸.
//
// 아키텍처:
//   1) 서버가 /api/auth/cookie-issue 에서 두 쿠키를 함께 세팅:
//        - ws_session   (HttpOnly)  JWT access token
//        - ws_csrf      (JS 읽기 허용, SameSite=Strict)  random 32-hex
//      동시에 response body 에도 `csrfToken` 포함 → 클라이언트는
//      sessionStorage 에 저장해두고 이후 admin API fetch 시
//      X-CSRF-Token 헤더로 전송.
//   2) admin API route 는 verifyCsrfDoubleSubmit(request) 로
//      cookie(ws_csrf) == header(X-CSRF-Token) 을 timing-safe 비교.
//      phase 2 에서는 util 만 export 해두고 enforcement 는 phase 3 에서 붙임.
//
// 왜 double-submit 인가:
//   - SameSite=Strict 만으로 크로스사이트 POST 는 쿠키 동반을 못 막지만,
//     same-origin XSS 가 만든 fetch 는 쿠키가 붙는다.
//     double-submit 은 XSS 가 ws_csrf 쿠키 값을 읽어 헤더로도 실어야만 통과.
//     HttpOnly 쿠키만 훔치는 일반적 쿠키 탈취 공격에는 안전.
//   - phase 3 에서 모든 admin mutation route 에 gate.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { NextRequest } from 'next/server';
import { randomBytes, timingSafeEqual } from 'crypto';

export const CSRF_COOKIE_NAME = 'ws_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** 32-byte 랜덤 → hex (64 chars) */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * double-submit 검증. cookie 값과 header 값이 모두 존재하고 timing-safe 일치해야 true.
 * phase 2 에서는 export 만 하고 enforce 는 phase 3 에서 각 route 에 추가.
 */
export function verifyCsrfDoubleSubmit(request: NextRequest): boolean {
  try {
    const cookieVal = request.cookies?.get?.(CSRF_COOKIE_NAME)?.value || '';
    const headerVal = request.headers.get(CSRF_HEADER_NAME) || '';
    if (!cookieVal || !headerVal) return false;
    if (cookieVal.length !== headerVal.length) return false;
    const a = Buffer.from(cookieVal, 'utf8');
    const b = Buffer.from(headerVal, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * 요청의 Origin/Referer 가 same-origin 인지 검증.
 *   - production: NEXT_PUBLIC_SITE_URL 또는 request.nextUrl.origin 와 일치해야 통과
 *   - localhost dev: origin 이 localhost:* 이면 통과
 * browser 가 자동으로 origin 헤더를 붙여주므로 CSRF 1차 방어선으로 사용.
 *
 * 반환: { ok: boolean; reason?: string }
 */
export function verifySameOrigin(request: NextRequest): { ok: boolean; reason?: string } {
  const origin = (request.headers.get('origin') || '').toLowerCase();
  const referer = (request.headers.get('referer') || '').toLowerCase();

  const selfOrigin = (() => {
    try {
      return new URL(request.url).origin.toLowerCase();
    } catch {
      return '';
    }
  })();

  // 환경변수 원본 (운영 도메인 여러 개 지원: comma-separated)
  const envOrigins = (process.env.NEXT_PUBLIC_SITE_URL || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set<string>([selfOrigin, ...envOrigins]);

  // dev 편의: localhost 는 허용
  const isLocalhost = (u: string) => /^https?:\/\/localhost(:\d+)?$/i.test(u);

  if (origin) {
    if (allowed.has(origin)) return { ok: true };
    if (isLocalhost(origin) && process.env.NODE_ENV !== 'production') return { ok: true };
    return { ok: false, reason: 'origin_mismatch' };
  }

  // origin 헤더가 없는 경우 referer 로 폴백 (일부 구형 브라우저/프록시).
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin.toLowerCase();
      if (allowed.has(refOrigin)) return { ok: true };
      if (isLocalhost(refOrigin) && process.env.NODE_ENV !== 'production') return { ok: true };
      return { ok: false, reason: 'referer_mismatch' };
    } catch {
      return { ok: false, reason: 'referer_parse_error' };
    }
  }

  // same-origin fetch 에서는 보통 origin 이 붙는다. 둘 다 없으면 애매한 요청 → 거부.
  return { ok: false, reason: 'no_origin_or_referer' };
}
