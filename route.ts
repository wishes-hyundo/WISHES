import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export const maxDuration = 60;
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const ALLOWED_ORIGINS = ['xbjgdsyukjdkfvcbzmjc.supabase.co'];
const CACHE_BUCKET = 'mosaic-cache';

// ─── 캐시 키 생성 ───
function createCacheKey(url: string): string {
  const match = url.match(/listing-images\/(.+?)(\.\w+)(\?.*)?$/);
  if (match) return match[1].replace(/\//g, '_') + '.webp';
  const hash = Buffer.from(url).toString('base64url').slice(0, 40);
  return `mosaic_${hash}.webp`;
}

// ─── Claude Vision으로 전화번호 영역 감지 ───
async function detectPhoneRegions(
  base64Image: string,
  mimeType: string
): Promise<{ x: number; y: number; w: number; h: number }[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not configured');
    return [];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `이 이미지에서 전화번호가 보이는 영역을 찾아주세요.
한국 전화번호 형식: 010-XXXX-XXXX, 02-XXX-XXXX, 031-XXX-XXXX 등.
전화번호뿐 아니라 전화번호가 적힌 간판, 현수막, 종이 등 전화번호를 포함하는 전체 텍스트 블록을 넉넉하게 감싸주세요.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "found": true,
  "regions": [
    { "x_pct": 10, "y_pct": 20, "w_pct": 35, "h_pct": 10 }
  ]
}

전화번호가 없으면:
{ "found": false, "regions": [] }

x_pct: 영역 왼쪽 가장자리 X 위치 (이미지 너비의 %)
y_pct: 영역 위쪽 가장자리 Y 위치 (이미지 높이의 %)
w_pct: 영역 너비 (이미지 너비의 %)
h_pct: 영역 높이 (이미지 높이의 %)

중요: 전화번호 영역보다 상하좌우 20% 이상 넓게 잡아주세요. 절대 좁게 잡지 마세요.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.found || !parsed.regions?.length) return [];

    // 퍼센트 → 비율 변환 + 추가 패딩 30%
    return parsed.regions.map((r: any) => {
      const padX = (r.w_pct / 100) * 0.3;
      const padY = (r.h_pct / 100) * 0.3;
      return {
        x: Math.max(0, r.x_pct / 100 - padX),
        y: Math.max(0, r.y_pct / 100 - padY),
        w: Math.min(1, (r.w_pct / 100) + padX * 2),
        h: Math.min(1, (r.h_pct / 100) + padY * 2),
      };
    });
  } catch (e) {
    console.error('Phone detection error:', e);
    return [];
  }
}

// ─── Sharp로 강력한 모자이크(픽셀화) 적용 ───
async function applyMosaicWithSharp(
  imageBuffer: Buffer,
  regions: { x: number; y: number; w: number; h: number }[]
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  let pipeline = sharp(imageBuffer);
  const composites: sharp.OverlayOptions[] = [];

  for (const region of regions) {
    const left = Math.max(0, Math.round(region.x * width));
    const top = Math.max(0, Math.round(region.y * height));
    const rw = Math.min(Math.round(region.w * width), width - left);
    const rh = Math.min(Math.round(region.h * height), height - top);

    if (rw <= 4 || rh <= 4) continue;

    // ★ 핵심 변경: blockSize 10 → 40 (훨씬 강력한 모자이크)
    const blockSize = 40;
    const smallW = Math.max(1, Math.round(rw / blockSize));
    const smallH = Math.max(1, Math.round(rh / blockSize));

    // 1차: 강력한 픽셀화
    const mosaicRegion = await sharp(imageBuffer)
      .extract({ left, top, width: rw, height: rh })
      .resize(smallW, smallH, { kernel: 'nearest' })
      .resize(rw, rh, { kernel: 'nearest' })
      .toBuffer();

    composites.push({ input: mosaicRegion, left, top });

    // 2차: 반투명 회색 오버레이 추가 (이중 보호)
    const overlay = await sharp({
      create: {
        width: rw,
        height: rh,
        channels: 4,
        background: { r: 180, g: 180, b: 180, alpha: 0.5 },
      },
    }).png().toBuffer();

    composites.push({ input: overlay, left, top });
  }

  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  return pipeline.webp({ quality: 85 }).toBuffer();
}

// ─── Supabase 캐시 저장 ───
async function saveToCache(cacheKey: string, buffer: Buffer): Promise<string | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabase.storage
      .from(CACHE_BUCKET)
      .upload(cacheKey, buffer, {
        contentType: 'image/webp',
        upsert: true,
      });
    if (error) {
      console.error('Cache save error:', error);
      return null;
    }
    const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(cacheKey);
    return data.publicUrl;
  } catch (e) {
    console.error('Cache save exception:', e);
    return null;
  }
}

// ─── Supabase 캐시 확인 ───
async function getCachedImage(cacheKey: string): Promise<Buffer | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.storage.from(CACHE_BUCKET).download(cacheKey);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

// ─── "전화번호 없음" 마커 ───
async function markNoPhone(cacheKey: string): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.storage
      .from(CACHE_BUCKET)
      .upload(`${cacheKey}.nophone`, Buffer.from('NO_PHONE'), {
        contentType: 'text/plain',
        upsert: true,
      });
  } catch {}
}

async function hasNoPhoneMarker(cacheKey: string): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data } = await supabase.storage.from(CACHE_BUCKET).download(`${cacheKey}.nophone`);
    return !!data;
  } catch {
    return false;
  }
}

// ─── 기존 캐시 삭제 (재처리용) ───
async function clearCache(cacheKey: string): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.storage.from(CACHE_BUCKET).remove([cacheKey, `${cacheKey}.nophone`]);
  } catch {}
}

// ═══════════════════════════════════════════
// GET /api/mosaic-image?url=<supabase-image-url>&force=1
// ═══════════════════════════════════════════
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const forceReprocess = request.nextUrl.searchParams.get('force') === '1';

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_ORIGINS.some((origin) => parsedUrl.hostname === origin)) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const cacheKey = createCacheKey(url);

  // force 파라미터: 기존 캐시 삭제 후 재처리
  if (forceReprocess) {
    await clearCache(cacheKey);
  }

  // 1. 캐시된 모자이크 이미지 확인
  if (!forceReprocess) {
    const cachedBuffer = await getCachedImage(cacheKey);
    if (cachedBuffer) {
      return new NextResponse(cachedBuffer, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Mosaic-Cache': 'HIT',
        },
      });
    }

    // 2. "전화번호 없음" 마커 확인
    if (await hasNoPhoneMarker(cacheKey)) {
      return NextResponse.redirect(url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'X-Mosaic-Cache': 'SKIP',
        },
      });
    }
  }

  // 3. 원본 이미지 다운로드
  let imageBuffer: Buffer;
  let mimeType: string;
  try {
    const imageResp = await fetch(url);
    if (!imageResp.ok) {
      return NextResponse.redirect(url, { status: 302 });
    }
    imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    mimeType = imageResp.headers.get('content-type') || 'image/jpeg';
  } catch {
    return NextResponse.redirect(url, { status: 302 });
  }

  // 4. Claude Vision으로 전화번호 감지
  const base64Image = imageBuffer.toString('base64');
  const regions = await detectPhoneRegions(base64Image, mimeType);

  // 5. 전화번호가 없으면 → 마커 저장 후 원본 리다이렉트
  if (regions.length === 0) {
    markNoPhone(cacheKey).catch(() => {});
    return NextResponse.redirect(url, {
      status: 302,
      headers: {
        'Cache-Control': 'public, max-age=86400',
        'X-Mosaic-Phone': 'NONE',
      },
    });
  }

  // 6. 모자이크 적용 (강력한 픽셀화 + 반투명 오버레이)
  let processedBuffer: Buffer;
  try {
    processedBuffer = await applyMosaicWithSharp(imageBuffer, regions);
  } catch (e) {
    console.error('Mosaic processing error:', e);
    return NextResponse.redirect(url, { status: 302 });
  }

  // 7. 캐시 저장
  saveToCache(cacheKey, processedBuffer).catch(() => {});

  // 8. 처리된 이미지 반환
  return new NextResponse(processedBuffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Mosaic-Phone': 'DETECTED',
      'X-Mosaic-Regions': String(regions.length),
    },
  });
}
