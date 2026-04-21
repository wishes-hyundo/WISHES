import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────
// 2026-04-21 audit fix:
//   - H4: /api/admin/* 의 Access-Control-Allow-Origin '*' 을 화이트리스트로 축소
//   - M1: Referrer-Policy 를 strict-origin-when-cross-origin 으로 강화
//   - M5: deprecated X-XSS-Protection 헤더 제거 (CSP가 대체)
// ─────────────────────────────────────────────────────────────────────────
const ALLOWED_ADMIN_ORIGINS = [
  'https://wishes.co.kr',
  'https://www.wishes.co.kr',
  // 로컬 개발 / Vercel preview 는 개발 편의를 위해 허용
  'http://localhost:3000',
  'http://localhost:3001',
];

function resolveAdminOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (ALLOWED_ADMIN_ORIGINS.includes(origin)) return origin;
  // Vercel preview 도메인(*.vercel.app) 은 동적으로 허용
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.vercel.app')) return origin;
  } catch {
    /* invalid Origin header — 무시 */
  }
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS: admin API — 명시 화이트리스트만 허용
  if (pathname.startsWith('/api/admin/')) {
    const allowedOrigin = resolveAdminOrigin(request);

    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      };
      if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
      }
      return new NextResponse(null, { status: 200, headers });
    }

    const response = NextResponse.next();
    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    response.headers.set('Vary', 'Origin');
    return response;
  }

  if (pathname === '/api/address-search') {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const host = request.headers.get('host') || '';
  if (!host.includes('wishes.co.kr') && !host.includes('localhost')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  // M1: Referrer-Policy 를 현대 표준으로 강화
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // M5: X-XSS-Protection 은 deprecated — 제거 (CSP 가 대체)

  // 현 차단 CSP — 안정성을 위해 기존 정책 그대로 유지
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "frame-src 'self' https://t1.daumcdn.net https://postcode.map.daum.net https://*.daumcdn.net https://postcode.map.kakao.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.daumcdn.net https://dapi.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://www.google-analytics.com https://wcs.naver.net https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev https://wishes-image-proxy.wishes-img.workers.dev https://*.workers.dev https://d4k1brqee4emz.cloudfront.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com https://cdn.jsdelivr.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // H2 (2026-04-21): CSP Report-Only — 'unsafe-eval' 제거 효과를 무중단으로 관찰.
  //   Report-Only 는 차단하지 않고 위반만 리포트하므로 프로덕션 위험 없음.
  //   1주일 /api/csp-report 로그 관찰 후 위반 0 이면 위의 차단 CSP 에서도 'unsafe-eval' 제거.
  //   차단본과의 유일한 차이: script-src 에서 'unsafe-eval' 만 제거. 나머지는 동일.
  //
  //   리포팅 채널:
  //     - report-to (Chrome/Edge/Chromium-based 2026): Reporting-Endpoints 헤더로 선언
  //     - report-uri (Firefox/Safari 폴백): 동일 엔드포인트로 직접 POST
  response.headers.set(
    'Reporting-Endpoints',
    'csp-endpoint="/api/csp-report"'
  );
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    [
      "default-src 'self'",
      "frame-src 'self' https://t1.daumcdn.net https://postcode.map.daum.net https://*.daumcdn.net https://postcode.map.kakao.com",
      "script-src 'self' 'unsafe-inline' https://t1.daumcdn.net https://dapi.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://www.google-analytics.com https://wcs.naver.net https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev https://wishes-image-proxy.wishes-img.workers.dev https://*.workers.dev https://d4k1brqee4emz.cloudfront.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com https://cdn.jsdelivr.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "report-to csp-endpoint",
      "report-uri /api/csp-report",
    ].join('; ')
  );

  if (pathname.startsWith('/api/images/')) {
    const referer = request.headers.get('referer');
    if (referer && !referer.includes('wishes.co.kr') && !referer.includes('localhost')) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  if (pathname.includes('/storage/') && !pathname.startsWith('/api/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|og-image.png).*)',
  ],
};
