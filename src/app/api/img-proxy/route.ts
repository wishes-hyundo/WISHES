// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL
// 핫링크 보호가 있는 외부 CDN 이미지를 서버에서 가져와 반환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { applyWatermark } from '@/lib/watermark';

// 허용된 외부 이미지 호스트 (보안)
const ALLOWED_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',  // 온하우스 이미지 CDN
];

const CACHE_SECONDS = 86400; // 24시간

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return new NextResponse('url 파라미터 필요', { status: 400 });
    }

    // URL 디코딩 및 파싱
    let parsed: URL;
    try {
      parsed = new URL(decodeURIComponent(url));
    } catch {
      return new NextResponse('잘못된 URL', { status: 400 });
    }

    // 허용된 호스트만 프록시
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new NextResponse('허용되지 않은 호스트', { status: 403 });
    }

    // 서버에서 이미지 fetch (Referer 포함 — 핫링크 보호 우회)
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.onhouse.com/',
        'Origin': 'https://www.onhouse.com',
      },
      cache: 'force-cache',
    });

    if (!res.ok) {
      return new NextResponse('이미지 가져오기 실패', { status: res.status });
    }

    const imageBuffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    // 워터마크 적용
    let outputBuffer: Buffer;
    let outputType: string;
    try {
      outputBuffer = await applyWatermark(imageBuffer);
      outputType = 'image/webp';
    } catch {
      // 워터마크 실패 시 원본 반환
      outputBuffer = imageBuffer;
      outputType = contentType;
    }

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': outputType,
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        'X-Proxied': 'true',
      },
    });
  } catch (err) {
    console.error('[img-proxy] 오류:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
