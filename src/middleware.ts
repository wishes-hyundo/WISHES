import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────
// 2026-04-21 audit fix:
//   - H4: /api/admin/* 의 Access-Control-Allow-Origin '*' 을 화이트리스트로 축소
//   - M1: Referrer-Policy 를 strict-origin-when-cross-origin 으로 강화
//   - M5: deprecated X-XSS-Protection 헤더 제거 (CSP가 대체)
// ─────────────────────────────────────────────────────────────────────────
// L-sec130 (2026-04-22, M-3): localhost 는 NODE_ENV !== 'production' 일 때만
//   허용. 프로덕션에서 공격자가 http://localhost:3001 을 위조해 admin API 를
//   호출하는 CSRF 경로 차단. src/lib/cors.ts 와 완전히 동일한 규칙 유지.
const LOCAL_DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];
const ALLOWED_ADMIN_ORIGINS = [
  'https://wishes.co.kr',
  'https://www.wishes.co.kr',
  ...(process.env.NODE_ENV !== 'production' ? LOCAL_DEV_ORIGINS : []),
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

  // L-listingurl-path (2026-04-29 사장님 명령): /map/<숫자> 매물 path → query rewrite.
  //   사용자 URL 은 /map/53190 그대로 유지 (rewrite, not redirect).
  //   page.tsx 는 ?listing=ID 로 받아 처리. 클라이언트의 useListingUrlSync 가
  //   history.replaceState 로 다시 /map/53190 형식 URL 노출.
  if (pathname.startsWith('/map/') && !pathname.startsWith('/map-')) {
    const m = /^\/map\/(\d+)$/.exec(pathname);
    if (m) {
      const url = request.nextUrl.clone();
      url.pathname = '/map';
      url.searchParams.set('listing', m[1]);
      return NextResponse.rewrite(url);
    }
  }

  // G-39 (2026-05-03): /legal/privacy + /legal/terms → /privacy + /terms 로 통일.
  // 두 페이지가 다른 컨텐츠를 보여줘서 일관성 깨짐. /privacy + /terms 가 canonical.
  if (pathname === '/legal/privacy' || pathname === '/legal/terms') {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/legal', '');
    return NextResponse.redirect(url, 308);
  }

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

    // L-fix-legacy-strip (2026-04-28): /search 의 옛날 content.js + content-v260-perf.js
    //   가 'Authorization: Bearer <legacy>' literal 을 hardcode 로 보냄. 과거
    //   Chrome Extension 이 치환하던 가정인데 지금은 없음 → verifyAdminAuth 가
    //   literal '<legacy>' 를 그대로 받아 401.
    //   client-side patch (v294) 가 v260-perf 의 native fetch 를 인터셉트 못
    //   하는 케이스 (script load 순서) 가 있어 server-side 에서 일괄 처리.
    //   literal 'Bearer <legacy>' 를 strip → verifyAdminAuth 의 ws_session
    //   쿠키 fallback path 가 인증 처리.
    const incomingAuth = request.headers.get('authorization') || '';
    const strippedAuth =
      incomingAuth === 'Bearer <legacy>' || incomingAuth === 'bearer <legacy>';

    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        // L-sec145 (2026-04-23): X-CSRF-Token 헤더 허용 (C-2 phase 3a).
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      };
      if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      return new NextResponse(null, { status: 200, headers });
    }

    // L-sec145 (2026-04-23): CSRF double-submit soft-check for admin mutations.
    //   /api/admin/** POST/PATCH/PUT/DELETE 요청이 쿠키(ws_csrf)==헤더(X-CSRF-Token)
    //   을 들고 오는지 확인만 한다. 일치 불일치와 무관하게 현 단계는 통과.
    //   결과를 응답 헤더 `X-CSRF-Check` 로 노출 → Sentry/log drain 에서 실제
    //   트래픽 중 얼마나 CSRF 헤더를 붙이는지 집계 후 phase 3b 에서 hard-enforce.
    // L-sec147 (2026-04-23, C-2 phase 3b): 쿠키-기반 세션 트래픽만 hard-enforce.
    //   ws_session 또는 ws_csrf 쿠키가 붙어온 요청은 CSRF mismatch 시 403 차단.
    //   Bearer-only legacy 경로(쿠키 없음)는 여전히 soft-check — 마스터암호 로그인
    //   및 adminFetch 미경유 레거시 콜을 깨뜨리지 않기 위해 점진적 enforce.
    const mutatingMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
    let csrfStatus: 'pass' | 'mismatch' | 'missing' | 'na' = 'na';
    let csrfHardFail = false;
    if (mutatingMethods.has(request.method)) {
      try {
        const csrfCookie = request.cookies.get('ws_csrf')?.value || '';
        const csrfHeader = request.headers.get('x-csrf-token') || '';
        const sessionCookie = request.cookies.get('ws_session')?.value || '';
        // L-sec-review-phase3 (2026-04-23) 해설:
        //   cookieBacked 는 "이 클라이언트가 /api/auth/cookie-issue 를 통해
        //   최소한 한 번이라도 쿠키 발급을 받았다" 를 의미하는 proxy 플래그.
        //   ws_session(HttpOnly) 이 없어도 ws_csrf 만으로 true 가 되는 이유는,
        //   공격자가 쿠키 스트리핑으로 ws_session 만 제거해서 CSRF 체크를
        //   우회하려는 시도(cookie-only downgrade)를 차단하기 위함.
        //   실제 통과 조건은 아래 csrfStatus==='pass' — cookie == header 동시 일치가
        //   필요하므로 "쿠키 있음/헤더 없음" 조합은 반드시 hard-fail 된다.
        //   Bearer-only legacy 클라이언트는 두 쿠키가 모두 없어 cookieBacked=false →
        //   soft-check 경로로 흘러 기존 동작이 깨지지 않는다.
        const cookieBacked = Boolean(sessionCookie || csrfCookie);
        if (!csrfCookie && !csrfHeader) csrfStatus = 'missing';
        else if (csrfCookie && csrfHeader && csrfCookie === csrfHeader) csrfStatus = 'pass';
        else csrfStatus = 'mismatch';
        // 쿠키-기반 세션(cookie-issue 완료)인데 CSRF 헤더가 불일치/누락 → 차단.
        if (cookieBacked && csrfStatus !== 'pass') csrfHardFail = true;
      } catch {
        csrfStatus = 'missing';
      }
    }

    if (csrfHardFail) {
      const denyHeaders: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRF-Check': csrfStatus,
        Vary: 'Origin',
      };
      if (allowedOrigin) {
        denyHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
        denyHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      return new NextResponse(
        JSON.stringify({ success: false, error: 'CSRF token verification failed' }),
        { status: 403, headers: denyHeaders }
      );
    }

    let response: NextResponse;
    if (strippedAuth) {
      // request 헤더 복제 + Authorization 제거 → downstream route 가 cookie path 로 인증
      const newReqHdrs = new Headers(request.headers);
      newReqHdrs.delete('authorization');
      newReqHdrs.delete('Authorization');
      response = NextResponse.next({ request: { headers: newReqHdrs } });
      response.headers.set('X-Auth-Stripped', 'legacy-literal');
    } else {
      response = NextResponse.next();
    }
    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response.headers.set('Vary', 'Origin');
    // monitoring 용 — Bearer-only 경로의 CSRF 분포 파악 (여전히 soft-check).
    if (csrfStatus !== 'na') response.headers.set('X-CSRF-Check', csrfStatus);
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
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev https://wishes-image-proxy.wishes-img.workers.dev https://d4k1brqee4emz.cloudfront.net https://resource.zigbang.io https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      // L-sec143 (2026-04-23): Sentry ingest/report 도메인 추가 (L-observe1 연계).
      //   *.ingest.sentry.io / *.sentry.io 모두 허용. DSN 미설정 시 실제 요청 없음.
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com https://cdn.jsdelivr.net https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://demotiles.maplibre.org https://tiles.openfreemap.org https://*.openfreemap.org https://*.sentry.io https://*.ingest.sentry.io",
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
