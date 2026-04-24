// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WISHES photoProcess — 업로드 사진 공통 파이프라인 (2026-04-24)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 모든 이미지 업로드 경로 (admin/upload, listings/[id]/images, 매물 등록 등)
// 가 동일한 룩을 갖도록 아래 두 단계를 강제 적용한다.
//
//   (1) Classic Negative 필름 시뮬레이션 (Fujifilm 프리셋 근사)
//       - White Balance: +Red, -Blue  (따뜻, 시안 제거)
//       - Dynamic Range 400 근사       (linear 톤매핑)
//       - Colour +4                    (modulate saturation 1.18)
//       - Highlight −2 / Shadow −2     (gentle S-curve)
//       - Sharpness +2                 (sharpen)
//       - Grain Strong/Large           (noise overlay)
//       - Colour Chrome FX Blue        (recomb blue pop)
//       - Clarity −2                   (약한 softening)
//
//   (2) 중앙 "WISHES" 텍스트 워터마크
//       - 가운데 배치, opacity 0.16 (보일듯 말듯)
//       - 굵은 외곽선 + 미세 그림자 — 배경 대비 자동 확보
//       - 크기: min(w,h) × 0.14
//
// 기존 public/watermark.png / wishes_logo_transparent.png 기반 우하단
// 로고 워터마크는 **사용하지 않는다** (2026-04-24 사용자 결정).
// `applyWatermark` (src/lib/watermark.ts) 호출도 업로드 파이프라인에서 제거.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import sharp from 'sharp';

const MAX_W = 1920;
const MAX_H = 1440;

// Classic Negative 파라미터 (public/luts/classic-negative.cube 와 동일 수식)
const WB_RED_GAIN    = 1.08;   // +3 Red (따뜻)
const WB_BLUE_GAIN   = 0.88;   // -5 Blue (시안 제거, 필름 warm)
const GREEN_TO_YELLOW = 0.04;  // Classic Negative 시그니처: 녹→올리브 shift
const COLOUR_SAT     = 1.18;   // Colour +4
const LINEAR_A       = 1.06;   // 가벼운 대비 부스트
const LINEAR_B       = 4;      // Shadow lift (검정 깊이 완화, 필름 페이드)
const GAMMA          = 1.02;   // 아주 약한 midtone lift (S-curve 대체)
const SHARPEN_SIGMA  = 0.8;    // Sharpness +2
const SHARPEN_M1     = 0.4;
const SHARPEN_M2     = 1.2;
const GRAIN_STRENGTH = 14;     // ±7 noise (Strong/Large 근사)
const GRAIN_ALPHA    = 24;     // 그레인 오버레이 투명도

// 중앙 워터마크 파라미터
const WM_TEXT       = 'WISHES';
const WM_OPACITY    = 0.16;    // 보일듯 말듯
const WM_STROKE_OP  = 0.09;    // 외곽선 투명도
const WM_SCALE      = 0.14;    // 이미지 짧은 변 대비 폰트 크기

/**
 * 그레인 노이즈 버퍼를 생성한다 (회색 ±N, overlay 합성용).
 */
async function generateGrain(width: number, height: number): Promise<Buffer> {
  const px = width * height;
  const data = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const n = Math.round((Math.random() - 0.5) * GRAIN_STRENGTH * 2); // ±GRAIN_STRENGTH
    const v = 128 + n;
    data[i * 4]     = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = GRAIN_ALPHA;
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * 중앙 "WISHES" 워터마크 SVG 생성.
 * 흰색 반투명 채움 + 검정 반투명 외곽선으로 밝은/어두운 배경 모두에서 식별 가능.
 */
function buildCenterWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.round(Math.min(width, height) * WM_SCALE);
  const stroke = Math.max(1, Math.round(fontSize * 0.022));
  const letterSpacing = Math.round(fontSize * 0.08);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="'Arial Black', 'Helvetica Neue', 'Pretendard', sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    letter-spacing="${letterSpacing}"
    fill="rgba(255,255,255,${WM_OPACITY})"
    stroke="rgba(0,0,0,${WM_STROKE_OP})"
    stroke-width="${stroke}"
    paint-order="stroke fill"
  >${WM_TEXT}</text>
</svg>`;
  return Buffer.from(svg, 'utf-8');
}

/**
 * Classic Negative 필름 룩을 Sharp 파이프라인으로 근사한다.
 * 완벽 재현이 아닌 "따뜻·부드러운 필름 느낌" 을 노린다.
 */
async function applyClassicNegative(buffer: Buffer): Promise<{ buf: Buffer; width: number; height: number }> {
  // 1) 리사이즈 + 초기 필터
  const pre = sharp(buffer, { failOn: 'none' })
    .rotate()                                   // EXIF orientation 정규화
    .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
    // 2) White Balance + Colour Chrome FX Blue 근사 (3x3 컬러 매트릭스)
    // Color matrix: WB + Classic Negative green→olive shift + blue warmth
    .recomb([
      [WB_RED_GAIN,            GREEN_TO_YELLOW, 0.0],          // R += yellow shift from G (올리브 톤)
      [0.00,                    1.0 - GREEN_TO_YELLOW * 0.5, 0.0], // G slightly desat
      [-0.02,                   0.00,            WB_BLUE_GAIN], // B warm-shift
    ])
    // 3) Colour +4 (saturation boost)
    .modulate({ saturation: COLOUR_SAT })
    // 4) Highlight/Shadow -2 근사 (linear contrast)
    .linear(LINEAR_A, LINEAR_B)
    // 5) Gamma 1.05 (midtone lift)
    .gamma(GAMMA)
    // 6) Sharpness +2
    .sharpen({ sigma: SHARPEN_SIGMA, m1: SHARPEN_M1, m2: SHARPEN_M2 });

  const { data: preData, info } = await pre
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // 7) Grain 오버레이 (overlay 블렌드)
  const grain = await generateGrain(w, h);
  const grained = await sharp(preData, { raw: { width: w, height: h, channels: info.channels as 3 | 4 } })
    .composite([{ input: grain, blend: 'overlay' }])
    .toBuffer();

  return { buf: grained, width: w, height: h };
}

/**
 * 공개 API — 업로드된 원본 이미지 버퍼를 받아 최종 WebP 버퍼로 반환한다.
 * 모든 업로드 엔드포인트 (admin/upload, listings/[id]/images, 매물 등록 등)
 * 가 이 함수 단 하나를 호출해 룩을 통일한다.
 */
export async function processPhotoUpload(buffer: Buffer): Promise<Buffer> {
  try {
    // (1) Classic Negative
    const { buf: filmed, width, height } = await applyClassicNegative(buffer);

    // (2) 중앙 워터마크
    const wm = buildCenterWatermarkSvg(width, height);
    const finalBuf = await sharp(filmed)
      .composite([{ input: wm, gravity: 'center' }])
      .webp({ quality: 85 })
      .toBuffer();

    return finalBuf;
  } catch (err) {
    // 실패 시 원본 WebP 변환만 수행 (파이프라인 깨져도 업로드 자체는 진행)
    // eslint-disable-next-line no-console
    console.error('[photoProcess] pipeline failed — fallback to plain webp:', err);
    return sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  }
}

/**
 * 중앙 워터마크만 덧씌우고 싶은 경우 (예: 이미 처리된 외부 이미지 재스탬프)
 * 사용할 수 있는 헬퍼. Classic Negative 필터는 적용하지 않는다.
 */
export async function stampCenterWatermark(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width || MAX_W;
  const h = meta.height || MAX_H;
  const wm = buildCenterWatermarkSvg(w, h);
  return sharp(buffer)
    .composite([{ input: wm, gravity: 'center' }])
    .webp({ quality: 85 })
    .toBuffer();
}
