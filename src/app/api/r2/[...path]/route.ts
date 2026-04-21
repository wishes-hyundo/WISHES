import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

// Content-Type 매핑
function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    avif: 'image/avif',
  };
  return types[ext || ''] || 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = path.join('/');

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
        'Content-Type': response.ContentType || getContentType(filePath),
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
