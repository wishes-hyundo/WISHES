import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // L-sec80 (2026-04-22): R2 egress 방지. 1y immutable 캐시도
  //   unique path 로 우회 가능. 5분 120회/IP cap.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `images-r2:ip:${_ip}`, limit: 120, windowMs: 5 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }

  const { path } = await params;
  // L-sec45 (2026-04-22): path traversal 차단 + 길이 cap.
  //   R2 버킷의 다른 prefix 객체를 임의로 읽지 못하게 segment 화이트리스트.
  const SAFE_SEG = /^[a-zA-Z0-9._\-]+$/;
  if (!path || path.length === 0 || path.length > 10) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  for (const seg of path) {
    if (!seg || seg === '.' || seg === '..' || !SAFE_SEG.test(seg)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }
  }
  const key = path.join('/');
  if (key.length > 500) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const bytes = await response.Body.transformToByteArray();

    // L-sec101 (2026-04-22): R2 Content-Type pass-through XSS 차단.
    //   image/svg+xml 등 스크립트 실행 가능 포맷은 application/octet-stream 으로 강등.
    //   nosniff 로 브라우저 MIME sniffing 차단, CSP sandbox 로 동일 오리진에서도 스크립트 격리.
    // L-video3 (2026-04-24): video/* 도 화이트리스트에 포함 (L-sec101 이 video 를 octet-stream 으로
    //   강등시키는 바람에 HTML5 video 가 재생 거부 -> L-video1/2 플레이어 실동작 차단). 동영상 포맷은
    //   svg 와 달리 브라우저 내 스크립트 실행 표면이 아니므로 통과시켜도 XSS 경로 없음.
    const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
    const SAFE_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska']);
    const rawCT = (response.ContentType || 'image/webp').toLowerCase().split(';')[0].trim();
    const isImage = SAFE_IMAGE_TYPES.has(rawCT);
    const isVideo = SAFE_VIDEO_TYPES.has(rawCT);
    const safeCT = isImage || isVideo ? rawCT : 'application/octet-stream';

    // video 는 HTMLMediaElement 재생이 목적이라 CSP sandbox 가 불필요. image 전용으로만 걸어준다.
    // 화이트리스트 밖 (octet-stream 으로 강등된 알 수 없는 타입) 은 기존 CSP 유지해서 XSS 차단.
    const headers: Record<string, string> = {
      'Content-Type': safeCT,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'Content-Length': String(bytes.length),
    };
    if (!isVideo) {
      headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; sandbox";
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    console.error('R2 image fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
