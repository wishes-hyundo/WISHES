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

export async function GET(request: NextRequest) {
  try {
    // L-sec74 (2026-04-22): 외부 이미지 프록시 대역폭 남용 방지
    //   5분 120회/IP cap. 이미지 heavy fetch 라 일반 API 보다 높게.
    //   ALLOWED_HOSTS 로 SSRF 는 차단 되어 있지만 attacker 가
    //   우리를 free CDN 으로 쓰는 거 방지.
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
    // L-sec19 (2026-04-22): URL 길이 cap. 2KB 넘는 URL 은 정상 사용 아님.
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
    // L-sec19: upstream hang 공격 차단 (10초 타임아웃)
    const res = await fetch(targetUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[img-proxy] fetch " + res.status + " " + res.statusText + " url=" + targetUrl + " body=" + errBody.substring(0,200));
      return new NextResponse("fetch failed: " + res.status, { status: res.status });
    }

    // L-sec19: 응답 바이트 cap (15MB). Content-Length 가 있으면 빠르게 차단,
    //   없으면 arrayBuffer 로드 후 길이 검증.
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
    // L-sec110 (2026-04-22): Content-Type allowlist. ALLOWED_HOSTS 로 SSRF 는
    //   차단되지만, upstream 이 image/svg+xml 또는 text/html 을
    //   돌려주면 raw=1 경로에서 attacker-controlled SVG/HTML 가
    //   wishes.co.kr 오리진으로 그대로 전달되어 XSS. 이미지
    //   raster 포맷만 허용.
    const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
    const primaryType = rawContentType.split(';')[0].trim();
    if (!SAFE_IMAGE_TYPES.includes(primaryType)) {
      return new NextResponse('unsupported upstream content-type', { status: 415 });
    }
    const contentType = primaryType;

    let outputBuffer: Buffer;
    let outputType: string;
    if (raw) {
      // v2.3.3: 관리자용 — 워터마크 적용 스킵
      outputBuffer = imageBuffer;
      outputType = contentType;
    } else {
      try {
        // L-photo-pipeline: 워터마크는 업로드 시 영구 합성. 프록시는 원본 패스스루.
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
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
