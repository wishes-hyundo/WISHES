import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip CSP for address search page (needs unrestricted script loading for Daum Postcode)
  if (request.nextUrl.pathname === '/api/address-search') {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // CSP: Block inline scripts except nonce, prevent data exfiltration
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "frame-src 'self' https://t1.daumcdn.net https://postcode.map.daum.net https://*.daumcdn.net https://postcode.map.kakao.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.daumcdn.net https://dapi.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://www.google-analytics.com https://wcs.naver.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.daumcdn.net https://t1.daumcdn.net https://*.kakao.com https://*.kakao.co.kr",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co https://dapi.kakao.com https://*.daumcdn.net https://www.google-analytics.com https://wcs.naver.net https://api.anthropic.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // Prevent image hotlinking from external sites
  if (pathname.startsWith('/api/images/')) {
    const referer = request.headers.get('referer');
    if (referer && !referer.includes('wishes.co.kr') && !referer.includes('localhost')) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // Block direct access to Supabase storage URLs (force through our API)
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
