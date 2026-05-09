// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL[&raw=1]

import { NextRequest, NextResponse } from 'next/server';
// L-photo-pipeline (2026-04-24): 업로드 시점에 이미 중앙 워터마크가 찍히므로
//   런타임 프록시의 우하단 로고 워터마크는 더 이상 적용하지 않는다.
// import { applyWatermark } from '@/lib/watermark';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  // v2.3.3: 내부 이미지 프록시 재프록시(관리자 페이지 Referer 우회)
  'wishes-image-proxy.wishes-img.workers.dev',
];

// v2.3.3: 상위 Worker 가 Referer 를 /search 경로로만 허용하므로 서버측에서 주입
const REFERER_OVERRIDES: Record<string, string> = {
  'wishes-image-proxy.wishes-img.workers.dev': 'https://wishes.co.kr/search',
};

const CACHE_SECONDS = 86400;

// L-imgproxy-fallback (2026-05-09 사장님 발견): 외부 사이트 503 / fetch 실패 시
//   500/503 응답 -> 클라이언트에 broken image + 콘솔 에러 누적. 대신 1x1
//   transparent PNG 200 응답으로 graceful fallback. 콘솔 깨끗 + UX 개선.
const TRANSPARENT_PNG_1X1 = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05,
  0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);
function _transparentFallback(reason: string): NextResponse {
  return new NextResponse(new Uint8Array(TRANSPARENT_PNG_1X1), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // 짧은 cache (5min) — 외부 사이트 일시 장애일 수도
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Proxied': 'fallback',
      'X-Fallback-Reason': reason,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    // L-sec74 (2026-04-22): 외부 이미지 프록시 대역폭 남용 방지
    //   5분 120회/IP cap. 이미지 heavy fetch 라 일반 API 보다 높게.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `img-proxy:ip:${_ip}`, limit: 120, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return new NextResponse('rate limited', {
        status: 429,
        headers: { 'Retry-After': String(_rl.retryAfterSec) },
      });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return new NextResponse('url parameter required', { status: 400 });
    }
    if (url.length > 2048) {
      return new NextResponse('url too long', { status: 413 });
    }
    const raw = request.nextUrl.searchParams.get('raw') === '1';

    let parsed: URL;
    try {
      parsed = new URL(decodeURIComponent(url));
    } catch {
      return new NextResponse('invalid URL', { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new NextResponse('host not allowed', { status: 403 });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
    const refererOverride = REFERER_OVERRIDES[parsed.hostname];
    if (refererOverride) headers['Referer'] = refererOverride;

    const targetUrl = parsed.toString();
    const res = await fetch(targetUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[img-proxy] fetch ' + res.status + ' ' + res.statusText + ' url=' + targetUrl + ' body=' + errBody.substring(0, 200));
      // L-imgproxy-fallback: 외부 사이트 503/404/500 -> transparent fallback
      return _transparentFallback('upstream_' + res.status);
    }

    const MAX_BYTES = 15 * 1024 * 1024;
    const lenHdr = parseInt(res.headers.get('content-length') || '0', 10);
    if (lenHdr > MAX_BYTES) {
      return new NextResponse('upstream too large', { status: 413 });
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      return new NextResponse('upstream too large', { status: 413 });
    }
    const imageBuffer = Buffer.from(ab);
    const rawContentType = (res.headers.get('content-type') || 'image/jpeg').toLowerCase();
    const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
    const primaryType = rawContentType.split(';')[0].trim();
    if (!SAFE_IMAGE_TYPES.includes(primaryType)) {
      // L-imgproxy-fallback: 외부 사이트가 이미지 아닌 응답 (text/html 에러 등)
      //   → transparent fallback (XSS 차단 의도 유지하면서 콘솔 깔끔)
      return _transparentFallback('content_type_' + primaryType.replace('/', '_'));
    }
    const contentType = primaryType;

    let outputBuffer: Buffer;
    let outputType: string;
    if (raw) {
      outputBuffer = imageBuffer;
      outputType = contentType;
    } else {
      try {
        outputBuffer = imageBuffer;
        outputType = contentType;
      } catch {
        outputBuffer = imageBuffer;
        outputType = contentType;
      }
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': outputType,
        'Cache-Control': 'public, max-age=' + CACHE_SECONDS + ', s-maxage=' + CACHE_SECONDS,
        'X-Proxied': 'true',
      },
    });
  } catch (err) {

    console.error('[img-proxy] error:', err);
    // L-imgproxy-fallback: fetch throw (timeout / DNS / network) -> transparent
    return _transparentFallback('fetch_error');
  }
}
