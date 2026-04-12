import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS: admin API
  if (pathname.startsWith('/api/admin/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "frame-src 'self' https://t1.daumcdn.net https://postcode.map.daum.net https://*.daumcdn.net https://postcode.map.kakao.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.daumcdn.net https://dapi.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://www.google-analytics.com https://wcs.naver.net https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev https://d4k1brqee4emz.cloudfront.net",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com https://cdn.jsdelivr.net",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
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
