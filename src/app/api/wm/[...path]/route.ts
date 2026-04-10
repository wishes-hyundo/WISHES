// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES 워터마크 프록시 API
// GET /api/wm/[...path]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { applyWatermark } from '@/lib/watermark';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
const CACHE_SECONDS = 3600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    let imageBuffer: Buffer | null = null;
    let contentType = 'image/jpeg';

    // 1순위: 내부 API 이미지 (api/images/... 경로)
    if (filePath.startsWith('api/')) {
      const internalUrl = `${SITE_URL}/${filePath}`;
      try {
        const internalRes = await fetch(internalUrl, { cache: 'no-store' });
        if (internalRes.ok) {
          imageBuffer = Buffer.from(await internalRes.arrayBuffer());
          contentType = internalRes.headers.get('content-type') || 'image/jpeg';
        }
      } catch (e) {
        console.error('[wm-proxy] 내부 API fetch 실패:', e);
      }
    }

    // 2순위: Cloudflare R2
    if (!imageBuffer) {
      const r2Url = `${R2_PUBLIC_URL}/${filePath}`;
      const r2Res = await fetch(r2Url);
      if (r2Res.ok) {
        imageBuffer = Buffer.from(await r2Res.arrayBuffer());
        contentType = r2Res.headers.get('content-type') || contentType;
      }
    }

    // 3순위: 로컬 파일 (개발 환경)
    if (!imageBuffer) {
      const localPath = path.join(process.cwd(), 'public', 'images', filePath);
      if (fs.existsSync(localPath)) {
        imageBuffer = fs.readFileSync(localPath);
        if (filePath.endsWith('.png')) contentType = 'image/png';
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
      }
    }

    if (!imageBuffer) {
      return new NextResponse('이미지를 찾을 수 없습니다', { status: 404 });
    }

    const watermarked = await applyWatermark(imageBuffer);

    return new NextResponse(watermarked, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        'X-Watermarked': 'true',
      },
    });
  } catch (err) {
    console.error('[wm-proxy] 오류:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
