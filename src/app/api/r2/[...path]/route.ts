import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// R2 클라이언트 싱글톤
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2Client;
}

// L-sec101 (2026-04-22): svg 매핑 제거. image/svg+xml 은 wishes.co.kr 오리진에서 스크립트
//   실행 가능 — 동일 오리진 저장된 토큰/세션 탈취 가능하므로 프록시에서 서비스 금지.
function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
  };
  return types[ext || ''] || 'application/octet-stream';
}

// L-sec101: R2 가 legacy image/svg+xml 를 반환하더라도 프록시에서 화이트리스트 강제.
const SAFE_IMAGE_TYPES_R2 = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
function safeCtR2(ct: string | undefined, path: string): string {
  const raw = (ct || getContentType(path)).toLowerCase().split(';')[0].trim();
  return SAFE_IMAGE_TYPES_R2.has(raw) ? raw : 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // L-sec80 (2026-04-22): R2 egress 방지. 1y immutable 캐시 있으나
  //   unique path 로 cold cache 마다 R2 과금. 5분 120회/IP cap.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `r2-proxy:ip:${_ip}`, limit: 120, windowMs: 5 * 60_000 });
  if (!_rl.ok) {
    return new NextResponse('rate limited', {
      status: 429,
      headers: { 'Retry-After': String(_rl.retryAfterSec) },
    });
  }

  const { path } = await params;
  // L-sec44 (2026-04-22): path traversal 차단 + 길이 cap.
  //   이전엔 path=['listings','..','secret'] → filePath='listings/../secret' 가
  //   startsWith('listings/') 를 통과해 다른 prefix 객체 읽기가 가능했음.
  const SAFE_SEG = /^[a-zA-Z0-9._\-]+$/;
  for (const seg of path) {
    if (!seg || seg === '.' || seg === '..' || !SAFE_SEG.test(seg)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }
  const filePath = path.join('/');
  if (filePath.length > 500) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 보안: listings 경로만 허용
  if (!filePath.startsWith('listings/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const client = getR2Client();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'wishes-listings',
        Key: filePath,
      })
    );

    const body = await response.Body?.transformToByteArray();
    if (!body) {
      return new NextResponse('Not Found', { status: 404 });
    }

    return new NextResponse(new Uint8Array(body as Uint8Array), {
      status: 200,
      headers: {
        // L-sec101: Content-Type 화이트리스트 + nosniff + CSP sandbox (SVG XSS 차단).
        'Content-Type': safeCtR2(response.ContentType, filePath),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return new NextResponse('Not Found', { status: 404 });
    }
    console.error('R2 proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
