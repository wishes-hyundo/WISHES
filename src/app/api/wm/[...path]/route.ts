// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES 워터마크 프록시 API
// GET /api/wm/[...path]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { applyWatermark } from '@/lib/watermark';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
const CACHE_SECONDS = 3600;

// L-sec35 (2026-04-22): path traversal + SSRF 방어 상수
const WM_MAX_BYTES = 25 * 1024 * 1024; // 25MB
const WM_FETCH_TIMEOUT_MS = 5000;
const WM_SAFE_SEGMENT_RE = /^[a-zA-Z0-9._\-\[\]]+$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // L-sec76 (2026-04-22): sharp CPU + R2 fetch heavy (~100-500ms/img).
    //   5분 60회/IP cap. 이미지 heavy 가 아니므로 img-proxy 보다 타이트.
    const _ip = getClientIp(_request);
    const _rl = checkRateLimit({ key: `wm:ip:${_ip}`, limit: 60, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return new NextResponse('rate limited', {
        status: 429,
        headers: { 'Retry-After': String(_rl.retryAfterSec) },
      });
    }

    const { path: pathSegments } = await params;

    // L-sec35: 각 segment 를 보수적인 화이트리스트로 검증.
    //   - '.', '..', 빈 문자열, 제어문자, 슬래시 제외
    //   - 경로 조작 (SSRF / path traversal) 차단
    if (!pathSegments || pathSegments.length === 0 || pathSegments.length > 20) {
      return new NextResponse('Bad Request', { status: 400 });
    }
    for (const seg of pathSegments) {
      if (!seg || seg === '.' || seg === '..' || !WM_SAFE_SEGMENT_RE.test(seg)) {
        return new NextResponse('Bad Request', { status: 400 });
      }
    }
    const filePath = pathSegments.join('/');
    if (filePath.length > 500) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    let imageBuffer: Buffer | null = null;
    let contentType = 'image/jpeg';

    // 1순위: 내부 API 이미지 (api/images/... 경로만 허용 — SSRF 방지)
    if (filePath.startsWith('api/')) {
      if (!filePath.startsWith('api/images/')) {
        return new NextResponse('Bad Request', { status: 400 });
      }
      const internalUrl = `${SITE_URL}/${filePath}`;
      try {
        const internalRes = await fetch(internalUrl, {
          cache: 'no-store',
          signal: AbortSignal.timeout(WM_FETCH_TIMEOUT_MS),
        });
        if (internalRes.ok) {
          const cLen = parseInt(internalRes.headers.get('content-length') || '0', 10);
          if (cLen > WM_MAX_BYTES) {
            return new NextResponse('Payload too large', { status: 413 });
          }
          const buf = Buffer.from(await internalRes.arrayBuffer());
          if (buf.length > WM_MAX_BYTES) {
            return new NextResponse('Payload too large', { status: 413 });
          }
          imageBuffer = buf;
          contentType = internalRes.headers.get('content-type') || 'image/jpeg';
        }
      } catch (e) {
        console.error('[wm-proxy] 내부 API fetch 실패:', e);
      }
    }

    // 2순위: Cloudflare R2
    if (!imageBuffer) {
      const r2Url = `${R2_PUBLIC_URL}/${filePath}`;
      try {
        const r2Res = await fetch(r2Url, { signal: AbortSignal.timeout(WM_FETCH_TIMEOUT_MS) });
        if (r2Res.ok) {
          const cLen = parseInt(r2Res.headers.get('content-length') || '0', 10);
          if (cLen > WM_MAX_BYTES) {
            return new NextResponse('Payload too large', { status: 413 });
          }
          const buf = Buffer.from(await r2Res.arrayBuffer());
          if (buf.length > WM_MAX_BYTES) {
            return new NextResponse('Payload too large', { status: 413 });
          }
          imageBuffer = buf;
          contentType = r2Res.headers.get('content-type') || contentType;
        }
      } catch (e) {
        console.error('[wm-proxy] R2 fetch 실패:', e);
      }
    }

    // 3순위: 로컬 파일 (개발 환경) — path.resolve 로 public/images 밖 이탈 방지
    if (!imageBuffer) {
      const baseDir = path.resolve(process.cwd(), 'public', 'images');
      const localPath = path.resolve(baseDir, filePath);
      if (localPath.startsWith(baseDir + path.sep) || localPath === baseDir) {
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          imageBuffer = fs.readFileSync(localPath);
          if (filePath.endsWith('.png')) contentType = 'image/png';
          else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
        }
      }
    }

    if (!imageBuffer) {
      return new NextResponse('이미지를 찾을 수 없습니다', { status: 404 });
    }

    const watermarked = await applyWatermark(imageBuffer);

    return new NextResponse(new Uint8Array(watermarked), {
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
