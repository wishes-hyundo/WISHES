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

// ─────────────────────────────────────────────────────────────────────────
// v7 §5 단축 URL: wishes.me 최상위 코드 → /s/<code> rewrite
//   host 가 wishes.me 이고 pathname 이 /XXXXXX (4~12자 base62) 이면
//   /s/XXXXXX 로 내부 rewrite. 다른 경로(/map, /api/...) 는 정상 처리.
// ─────────────────────────────────────────────────────────────────────────
const SHORT_CODE_PATTERN = /^\/([0-9A-Za-z]{4,12})$/;
const SHORT_CODE_RESERVED = new Set([
  'admin', 'api', 'login', 'signup', 'auth', 'map', 'search',
  'listings', 'mypage', 'faq', 'about', 'contact', 'privacy',
  'terms', 'unsub', 'calculator', 'compare', 'robots', 'sitemap',
  's', 'favicon', 'og-image', 'apple-touch-icon',
]);

function isShortUrlHost(host: string): boolean {
  return host === 'wishes.me' || host.endsWith('.wishes.me');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') ?? '').toLowerCase();

  // v7 §5: wishes.me 호스트 최상위 단축 URL → /s/<code> rewrite
  if (isShortUrlHost(host)) {
    const m = SHORT_CODE_PATTERN.exec(pathname);
    if (m && !SHORT_CODE_RESERVED.has(m[1].toLowerCase())) {
      const url = request.nextUrl.clone();
      url.pathname = `/s/${m[1]}`;
      return NextResponse.rewrite(url);
    }
    // wishes.me root (/, /map 등) 는 wishes.co.kr 로 permanent redirect
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('https://wishes.co.kr/map', request.url), 308);
    }
  }

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

  // L-sec56 (2026-04-22): host substring 매치 → 엄격한 hostname suffix 검증.
  //   기존 String.includes('wishes.co.kr') 는 'evilwishes.co.kr.attacker.com' 같은
  //   악성 도메인도 매치되어 X-Robots-Tag 가 누락되는 약점.
  //   host 헤더는 hostname[:port] 형태라 포트만 제거 후 정확 일치/서픽스 검증.
  const hostname = host.split(':')[0];
  const isOwnHost =
    hostname === 'wishes.co.kr' ||
    hostname.endsWith('.wishes.co.kr') ||
    hostname === 'wishes.me' ||
    hostname.endsWith('.wishes.me') ||
    hostname === 'localhost' ||
    hostname.endsWith('.vercel.app');
  if (!isOwnHost) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  // M1: Referrer-Policy 를 현대 표준으로 강화
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // M5: X-XSS-Protection 은 deprecated — 제거 (CSP 가 대체)

  // L-sec4 (2026-04-22): CSP Enforce — 'unsafe-eval' 제거 완료.
  //   MapLibre/deck.gl/pmtiles 프로덕션 chunks 15개 전수 검증, eval(/new Function( 0건.
  //   Report-Only 병행 중단 — 승격 후에도 Enforce 채널에 report-to/report-uri 유지.
  // L-sec102 (2026-04-22): img-src 'https://*.workers.dev' wildcard 제거.
  //   *.workers.dev 는 누구나 Workers script 배포 가능 — 와일드카드 허용 시
  //   XSS 환경에서 attacker.workers.dev 픽셀로 데이터 exfil/tracking 가능.
  //   실제 사용되는 hostname 은 wishes-image-proxy.wishes-img.workers.dev 단 1개.
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "frame-src 'self' https://t1.daumcdn.net https://postcode.map.daum.net https://*.daumcdn.net https://postcode.map.kakao.com",
      "script-src 'self' 'unsafe-inline' https://t1.daumcdn.net https://dapi.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://www.google-analytics.com https://wcs.naver.net https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev https://wishes-image-proxy.wishes-img.workers.dev https://d4k1brqee4emz.cloudfront.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com https://cdn.jsdelivr.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // L-sec4 (2026-04-22): CSP 승격 — Enforce 채널에서도 위반 리포트 수집
      "report-to csp-endpoint",
      "report-uri /api/csp-report",
    ].join('; ')
  );

  // L-sec4 (2026-04-22): Reporting API 선언 — Enforce CSP 위반을 /api/csp-report 에 전송.
  //   Chrome/Edge 는 Reporting-Endpoints 헤더 + CSP 'report-to', Firefox/Safari 는 'report-uri' 폴백.
  response.headers.set(
    'Reporting-Endpoints',
    'csp-endpoint="/api/csp-report"'
  );

  // L-sec56 (2026-04-22): /api/images/ referer 엄격 검증.
  //   기존 referer.includes('wishes.co.kr') 은 'https://evilwishes.co.kr.attacker.com/'
  //   같은 서브도메인 스푸핑이 통과. URL 파서로 hostname 추출 후 정확 일치/서픽스 매치.
  if (pathname.startsWith('/api/images/')) {
    const referer = request.headers.get('referer');
    if (referer) {
      let refHost: string | null = null;
      try {
        refHost = new URL(referer).hostname;
      } catch {
        /* invalid URL */
      }
      const refererOk =
        refHost !== null && (
          refHost === 'wishes.co.kr' ||
          refHost.endsWith('.wishes.co.kr') ||
          refHost === 'wishes.me' ||
          refHost.endsWith('.wishes.me') ||
          refHost === 'localhost' ||
          refHost.endsWith('.vercel.app')
        );
      if (!refererOk) {
        return new NextResponse('Forbidden', { status: 403 });
      }
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
