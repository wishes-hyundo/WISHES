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

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': response.ContentType || 'image/webp',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'Content-Length': String(bytes.length),
      },
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    console.error('R2 image fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
