// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL[&raw=1]

import { NextRequest, NextResponse } from 'next/server';
import { applyWatermark } from '@/lib/watermark';

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
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return new NextResponse('url parameter required', { status: 400 });
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
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[img-proxy] fetch " + res.status + " " + res.statusText + " url=" + targetUrl + " body=" + errBody.substring(0,200));
      return new NextResponse("fetch failed: " + res.status, { status: res.status });
    }

    const imageBuffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    let outputBuffer: Buffer;
    let outputType: string;
    if (raw) {
      // v2.3.3: 관리자용 — 워터마크 적용 스킵
      outputBuffer = imageBuffer;
      outputType = contentType;
    } else {
      try {
        outputBuffer = await applyWatermark(imageBuffer);
        outputType = 'image/webp';
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
