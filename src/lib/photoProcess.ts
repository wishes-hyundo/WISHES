// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES photoProcess — 업로드 사진 공통 파이프라인 (2026-04-24)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import sharp from 'sharp';

const MAX_W = 1920;
const MAX_H = 1440;

// Classic Negative 파라미터
const WB_RED_GAIN     = 1.08;
const WB_BLUE_GAIN    = 0.88;
const GREEN_TO_YELLOW = 0.04;
const COLOUR_SAT      = 1.22;
const LINEAR_A        = 1.06;
const LINEAR_B        = 6;
const GAMMA           = 1.02;
const SHARPEN_SIGMA   = 0.8;
const SHARPEN_M1      = 0.4;
const SHARPEN_M2      = 1.2;
const GRAIN_STRENGTH  = 14;
const GRAIN_ALPHA     = 28;
const WM_SCALE        = 0.55;

async function generateGrain(width: number, height: number): Promise<Buffer> {
  const px = width * height;
  const data = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const n = Math.round((Math.random() - 0.5) * GRAIN_STRENGTH * 2);
    const v = 128 + n;
    data[i * 4]     = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = GRAIN_ALPHA;
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

let _wmCache: Buffer | null = null;
async function getWatermarkPng(): Promise<Buffer | null> {
  if (_wmCache) return _wmCache;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const wmPath = path.join(process.cwd(), 'public', 'watermark-center.png');
    if (fs.existsSync(wmPath)) {
      _wmCache = fs.readFileSync(wmPath);
      return _wmCache;
    }
  } catch (e) {
    console.warn('[photoProcess] fs watermark failed:', (e as Error)?.message);
  }
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
    const res = await fetch(`${siteUrl}/watermark-center.png`, { cache: 'force-cache' });
    if (res.ok) {
      _wmCache = Buffer.from(await res.arrayBuffer());
      return _wmCache;
    }
    console.warn('[photoProcess] fetch watermark status=', res.status);
  } catch (e) {
    console.warn('[photoProcess] fetch watermark threw:', (e as Error)?.message);
  }
  return null;
}

async function resizedWatermark(targetWidth: number): Promise<Buffer | null> {
  const raw = await getWatermarkPng();
  if (!raw) return null;
  const wmW = Math.max(200, Math.round(targetWidth * WM_SCALE));
  return sharp(raw).resize(wmW).png().toBuffer();
}

export async function processPhotoUpload(buffer: Buffer): Promise<Buffer> {
  let stage = 'init';
  try {
    stage = 'metadata';
    const probe = await sharp(buffer, { failOn: 'none' }).rotate().metadata();
    const srcW = probe.width || MAX_W;
    const srcH = probe.height || MAX_H;
    const scale = Math.min(MAX_W / srcW, MAX_H / srcH, 1);
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));
    console.log(`[photoProcess] target ${outW}x${outH} (src ${srcW}x${srcH})`);

    stage = 'build-overlays';
    const grain = await generateGrain(outW, outH);
    const wm = await resizedWatermark(outW);

    const overlays: sharp.OverlayOptions[] = [];
    overlays.push({ input: grain, blend: 'overlay' });
    if (wm) overlays.push({ input: wm, gravity: 'center' });
    else console.warn('[photoProcess] watermark unavailable - grain only');

    stage = 'single-chain';
    const finalBuf = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(outW, outH, { fit: 'inside', withoutEnlargement: true })
      .recomb([
        [WB_RED_GAIN,  GREEN_TO_YELLOW,               0.0],
        [0.00,         1.0 - GREEN_TO_YELLOW * 0.5,   0.0],
        [-0.02,        0.00,                          WB_BLUE_GAIN],
      ])
      .modulate({ saturation: COLOUR_SAT })
      .linear(LINEAR_A, LINEAR_B)
      .gamma(GAMMA)
      .sharpen({ sigma: SHARPEN_SIGMA, m1: SHARPEN_M1, m2: SHARPEN_M2 })
      .composite(overlays)
      .webp({ quality: 85 })
      .toBuffer();

    console.log(`[photoProcess] OK ${buffer.length}B -> ${finalBuf.length}B`);
    return finalBuf;
  } catch (err) {
    console.error(`[photoProcess] FAIL stage=${stage}:`, err);
    return sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  }
}

export async function processPosterImage(posterBuffer: Buffer): Promise<Buffer> {
  return processPhotoUpload(posterBuffer);
}

export async function stampCenterWatermark(buffer: Buffer): Promise<Buffer> {
  return processPhotoUpload(buffer);
}
