// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES 워터마크 유틸리티 (서버 전용)
// Sharp 기반 이미지 합성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import path from 'path';
import fs from 'fs';

const WATERMARK_OPACITY = 0.45;  // 투명도 (0.0 ~ 1.0)
const WATERMARK_SCALE   = 0.28;  // 이미지 대비 워터마크 크기
const WATERMARK_MARGIN  = 25;    // 우하단 여백 (px)

/**
 * 이미지 버퍼에 WISHES 워터마크를 합성합니다.
 *
 * 지원하는 로고 파일 (우선순위 순):
 *   1. public/watermark.png          — 투명 배경 RGBA PNG (최적)
 *   2. public/wishes_logo_transparent.png — 어두운 배경 PNG (screen 블렌드 처리)
 *   3. public/wishes_logo_final_v2.png
 */
export async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  const image = sharp(imageBuffer);
  const { width: imgW = 800, height: imgH = 600 } = await image.metadata();

  // 로고 파일 탐색 (우선순위 순)
  const logoCandidates = [
    path.join(process.cwd(), 'public', 'watermark.png'),
    path.join(process.cwd(), 'public', 'wishes_logo_transparent.png'),
    path.join(process.cwd(), 'public', 'wishes_logo_final_v2.png'),
  ];
  const logoPath = logoCandidates.find(p => fs.existsSync(p));
  if (!logoPath) {
    console.warn('[watermark] 로고 파일 없음 — 원본 반환');
    return imageBuffer;
  }

  const wmW = Math.round(imgW * WATERMARK_SCALE);

  // 로고가 어두운 배경(dark bg)인지 확인
  const isDarkBg = logoPath.includes('wishes_logo_transparent') || logoPath.includes('wishes_logo_final_v2');

  let wmBuffer: Buffer;

  if (isDarkBg) {
    // 어두운 배경 로고: screen 블렌드 모드로 합성
    // → 검은 영역은 투명하게, 밝은(금빛) 영역만 워터마크로 표시
    const wmResized = await sharp(logoPath).resize(wmW).toBuffer();
    const wmMeta2 = await sharp(wmResized).metadata();
    const w = wmMeta2.width!;
    const h = wmMeta2.height!;

    // screen 블렌드는 직접 지원되지 않으므로
    // 밝기 기반 알파마스크: 픽셀 밝기를 알파 채널로 변환
    const { data, info } = await sharp(wmResized)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels as number; // 3 or 4
    const out = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      // 밝기 (0~255)
      const brightness = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      out[i * 4]     = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      // 알파: 밝기에 비례 × 불투명도 배율
      out[i * 4 + 3] = Math.round(brightness * WATERMARK_OPACITY);
    }

    wmBuffer = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();
  } else {
    // 투명 배경 로고: 기존 방식 (dest-in으로 불투명도 적용)
    wmBuffer = await sharp(logoPath)
      .resize(wmW)
      .ensureAlpha()
      .composite([{
        input: Buffer.from([0, 0, 0, Math.round(255 * WATERMARK_OPACITY)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      }])
      .toBuffer();
  }

  // 실제 리사이즈된 워터마크 크기
  const wmMeta = await sharp(wmBuffer).metadata();
  const wmW2 = wmMeta.width  || wmW;
  const wmH2 = wmMeta.height || Math.round(wmW * 0.5);

  // 우하단 배치
  const left = Math.max(0, imgW - wmW2 - WATERMARK_MARGIN);
  const top  = Math.max(0, imgH - wmH2 - WATERMARK_MARGIN);

  return image
    .composite([{ input: wmBuffer, left, top }])
    .webp({ quality: 90 })
    .toBuffer();
}
