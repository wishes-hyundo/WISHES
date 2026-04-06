import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export const maxDuration = 30;
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const ALLOWED_ORIGINS = ['xbjgdsyukjdkfvcbzmjc.supabase.co'];
const CACHE_BUCKET = 'mosaic-cache';

function createCacheKey(url: string): string {
  const match = url.match(/listing-images\/(.+?)(\.[\w]+)(\?.*)?$/);
  if (match) return match[1].replace(/\//g, '_') + '.webp';
  const hash = Buffer.from(url).toString('base64url').slice(0, 40);
  return `mosaic_${hash}.webp`;
}

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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image },
            },
            {
              type: 'text',
              text: `Find phone numbers (Korean: 010-XXXX-XXXX, 02-XXX-XXXX etc) in this image.
Return bounding boxes as percentage coordinates of the image.
JSON only, no other text:
{ "found": true, "regions": [{ "x_pct": 10, "y_pct": 20, "w_pct": 30, "h_pct": 5 }] }
If no phone numbers: { "found": false, "regions": [] }
x_pct: left edge X position (% of image width)
y_pct: top edge Y position (% of image height)
w_pct: region width (% of image width)
h_pct: region height (% of image height)
Add padding around detected regions.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status);
      return [];
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.found || !parsed.regions?.length) return [];

    return parsed.regions.map((r: any) => ({
      x: r.x_pct / 100,
      y: r.y_pct / 100,
      w: r.w_pct / 100,
      h: r.h_pct / 100,
    }));
  } catch (e) {
    console.error('Phone detection error:', e);
    return [];
  }
}

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
    if (rw <= 0 || rh <= 0) continue;

    const blockSize = 10;
    const smallW = Math.max(1, Math.round(rw / blockSize));
    const smallH = Math.max(1, Math.round(rh / blockSize));

    const mosaicRegion = await sharp(imageBuffer)
      .extract({ left, top, width: rw, height: rh })
      .resize(smallW, smallH, { kernel: 'nearest' })
      .resize(rw, rh, { kernel: 'nearest' })
      .toBuffer();

    composites.push({ input: mosaicRegion, left, top });
  }

  if (composites.length > 0) pipeline = pipeline.composite(composites);
  return pipeline.webp({ quality: 85 }).toBuffer();
}

async function saveToCache(cacheKey: string, buffer: Buffer): Promise<string | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabase.storage
      .from(CACHE_BUCKET)
      .upload(cacheKey, buffer, { contentType: 'image/webp', upsert: true });
    if (error) { console.error('Cache save error:', error); return null; }
    const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(cacheKey);
    return data.publicUrl;
  } catch (e) { console.error('Cache save exception:', e); return null; }
}

async function getCachedImage(cacheKey: string): Promise<Buffer | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.storage.from(CACHE_BUCKET).download(cacheKey);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch { return null; }
}

async function markNoPhone(cacheKey: string): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const marker = Buffer.from('NO_PHONE');
    await supabase.storage.from(CACHE_BUCKET)
      .upload(`${cacheKey}.nophone`, marker, { contentType: 'text/plain', upsert: true });
  } catch {}
}

async function hasNoPhoneMarker(cacheKey: string): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data } = await supabase.storage.from(CACHE_BUCKET).download(`${cacheKey}.nophone`);
    return !!data;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });

  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_ORIGINS.some((origin) => parsedUrl.hostname === origin))
      return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
  } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }

  const cacheKey = createCacheKey(url);

  // 1. Check cached mosaic image
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

  // 2. Check "no phone" marker -> redirect to original
  if (await hasNoPhoneMarker(cacheKey)) {
    return NextResponse.redirect(url, { status: 302 });
  }

  // 3. Download original image
  let imageBuffer: Buffer;
  let mimeType: string;
  try {
    const imageResp = await fetch(url);
    if (!imageResp.ok) return NextResponse.redirect(url, { status: 302 });
    imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    mimeType = imageResp.headers.get('content-type') || 'image/jpeg';
  } catch { return NextResponse.redirect(url, { status: 302 }); }

  // 4. Detect phone numbers with Claude Vision
  const base64Image = imageBuffer.toString('base64');
  const regions = await detectPhoneRegions(base64Image, mimeType);

  // 5. No phone numbers -> mark and redirect to original
  if (regions.length === 0) {
    markNoPhone(cacheKey).catch(() => {});
    return NextResponse.redirect(url, { status: 302 });
  }

  // 6. Apply mosaic
  let processedBuffer: Buffer;
  try {
    processedBuffer = await applyMosaicWithSharp(imageBuffer, regions);
  } catch (e) {
    console.error('Mosaic processing error:', e);
    return NextResponse.redirect(url, { status: 302 });
  }

  // 7. Save to cache (async)
  saveToCache(cacheKey, processedBuffer).catch(() => {});

  // 8. Return processed image
  return new NextResponse(processedBuffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Mosaic-Phone': 'DETECTED',
      'X-Mosaic-Regions': String(regions.length),
    },
  });
}
