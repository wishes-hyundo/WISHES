// /api/img-proxy — server-side 이미지 프록시 (referer 검사 우회)
// 사장님 보고 (2026-04-29): "직접 올린 사진은 뜨는데 그 외 사진은 전혀 안뜸"
// 크롤링 매물의 wishes-image-proxy.wishes-img.workers.dev URL 이 Referer 검사로 403
// → server-side fetch (referer 직접 설정) → self-origin response stream

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const ALLOWED_HOSTS = [
  'wishes-image-proxy.wishes-img.workers.dev',
  'pub-e16c7a50584c4db7be3571746cd80716.r2.dev',
  'd4k1brqee4emz.cloudfront.net',
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return new NextResponse('Missing url', { status: 400 });

  let parsed: URL;
  try { parsed = new URL(target); }
  catch { return new NextResponse('Invalid url', { status: 400 }); }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'Referer': 'https://wishes.co.kr/search',
        'User-Agent': request.headers.get('user-agent') || 'wishes-img-proxy/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, { status: upstream.status });
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'X-Img-Proxy': 'wishes-v1',
      },
    });
  } catch (e) {
    return new NextResponse('Fetch failed: ' + ((e as Error)?.message || ''), { status: 502 });
  }
}
