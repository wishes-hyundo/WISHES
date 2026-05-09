// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL[&raw=1]

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'wishes-image-proxy.wishes-img.workers.dev',
  // L-imgproxy-zigbang (2026-05-09): 온하우스/직방/네모 협업 CDN
  'resource.zigbang.io',
];

const REFERER_OVERRIDES: Record<string, string> = {
  'wishes-image-proxy.wishes-img.workers.dev': 'https://wishes.co.kr/search',
};

const CACHE_SECONDS = 86400;

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
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Proxied': 'fallback',
      'X-Fallback-Reason': reason,
    },
  });
}

// L-imgproxy-magic: magic bytes 로 image type 추론.
function _detectImageMagic(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70 &&
      buf[8] === 0x61 && buf[9] === 0x76 && buf[10] === 0x69 && buf[11] === 0x66) return 'image/avif';
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `img-proxy:ip:${_ip}`, limit: 120, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return new NextResponse('rate limited', {
        status: 429,
        headers: { 'Retry-After': String(_rl.retryAfterSec) },
      });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('url parameter required', { status: 400 });
    if (url.length > 2048) return new NextResponse('url too long', { status: 413 });
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

    // L-imgproxy-resize-fallback (2026-05-09 사장님 매물 78752):
    //   CloudFront Lambda@Edge resize 함수가 큰 size (?w=1920) 처리 시 503.
    //   작은 size (?w=720) 또는 원본은 정상. 자동 size 줄여서 retry.
    const fetchOpts = { headers, cache: 'no-store' as const, signal: AbortSignal.timeout(10_000) };
    let targetUrl = parsed.toString();
    let res = await fetch(targetUrl, fetchOpts);

    if (!res.ok && res.status === 503 && parsed.searchParams.has('w')) {
      const originalW = parsed.searchParams.get('w');
      const fallbackSizes: (string | null)[] = ['720', '400', null];
      for (const w of fallbackSizes) {
        const fb = new URL(parsed.toString());
        if (w === null) fb.searchParams.delete('w');
        else fb.searchParams.set('w', w);
        try {
          const r2 = await fetch(fb.toString(), fetchOpts);
          if (r2.ok) {
            console.log('[img-proxy] resize fallback: w=' + originalW + ' → ' + (w || 'none'));
            res = r2;
            targetUrl = fb.toString();
            break;
          }
        } catch (_) {}
      }
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[img-proxy] fetch ' + res.status + ' url=' + targetUrl + ' body=' + errBody.substring(0, 200));
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
    let primaryType = rawContentType.split(';')[0].trim();

    if (!SAFE_IMAGE_TYPES.includes(primaryType)) {
      const detected = _detectImageMagic(imageBuffer);
      if (detected) {
        primaryType = detected;
      } else {
        return _transparentFallback('content_type_' + primaryType.replace('/', '_'));
      }
    }
    const contentType = primaryType;

    let outputBuffer: Buffer;
    let outputType: string;
    if (raw) {
      outputBuffer = imageBuffer;
      outputType = contentType;
    } else {
      outputBuffer = imageBuffer;
      outputType = contentType;
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
    return _transparentFallback('fetch_error');
  }
}
