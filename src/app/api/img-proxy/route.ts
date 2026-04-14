// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL

import { NextRequest, NextResponse } from 'next/server';
import { applyWatermark } from '@/lib/watermark';

const ALLOWED_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
];

const CACHE_SECONDS = 86400;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return new NextResponse('url parameter required', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(decodeURIComponent(url));
    } catch {
      return new NextResponse('invalid URL', { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new NextResponse('host not allowed', { status: 403 });
    }

    const targetUrl = parsed.toString();
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
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
    try {
      outputBuffer = await applyWatermark(imageBuffer);
      outputType = 'image/webp';
    } catch {
      outputBuffer = imageBuffer;
      outputType = contentType;
    }

    return new NextResponse(outputBuffer, {
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
