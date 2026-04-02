// src/lib/imageHelpers.ts
// Privacy-first image enhancement
// ALL privacy detection via Claude API (server-side) - no client libraries needed

export interface MosaicDetection {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface EnhanceAnalysisResult {
  parameters?: {
    shadow_lift: number;
    highlight_recovery: number;
    contrast_strength: number;
    dehaze_strength: number;
    vibrance: number;
    sharpen_detail: number;
    sharpen_edge: number;
    color_temperature: number;
    vignette_strength: number;
  };
}

const DEFAULT_ENHANCE_PARAMS = {
  shadow_lift: 0.6,
  highlight_recovery: 0.4,
  contrast_strength: 0.3,
  dehaze_strength: 0.5,
  vibrance: 0.5,
  sharpen_detail: 0.6,
  sharpen_edge: 0.4,
  color_temperature: 0.1,
  vignette_strength: 0.15,
};

// ====================================================
// Utility Functions
// ====================================================

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) resolve(result);
      else reject(new Error('Empty file'));
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

function resizeImageForAPI(dataUrl: string, maxDim: number = 1600): Promise<string> {
  return new Promise((resolve) => {
    const ri = new Image();
    ri.onload = () => {
      let rw = ri.width;
      let rh = ri.height;
      if (rw > maxDim || rh > maxDim) {
        const ratio = Math.min(maxDim / rw, maxDim / rh);
        rw = Math.floor(rw * ratio);
        rh = Math.floor(rh * ratio);
      }
      const rc = document.createElement('canvas');
      rc.width = rw;
      rc.height = rh;
      rc.getContext('2d')!.drawImage(ri, 0, 0, rw, rh);
      resolve(rc.toDataURL('image/jpeg', 0.7));
    };
    ri.src = dataUrl;
  });
}

// ====================================================
// Privacy Detection (Claude API - ALL types)
// ====================================================

async function detectAllPrivacy(apiDataUrl: string): Promise<MosaicDetection[]> {
  console.log('[PRIVACY] Sending to Claude API for detection...');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: apiDataUrl, mode: 'mosaic' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.detections && data.detections.length > 0) {
          console.log('[PRIVACY] API detected', data.detections.length, 'items:',
            data.detections.map((d: MosaicDetection) => d.type).join(', '));
          return data.detections;
        }
        console.log('[PRIVACY] API returned 0 detections');
        return [];
      }

      console.log('[PRIVACY] API attempt', attempt, 'status:', res.status);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error('[PRIVACY] API attempt', attempt, 'failed:', err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return [];
}

// ====================================================
// Enhancement Parameters (Claude API)
// ====================================================

async function fetchEnhanceParams(
  apiDataUrl: string
): Promise<typeof DEFAULT_ENHANCE_PARAMS | null> {
  try {
    const res = await fetch('/api/analyze-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: apiDataUrl, mode: 'enhance' }),
    });
    if (res.ok) {
      const data: EnhanceAnalysisResult = await res.json();
      return data.parameters || null;
    }
  } catch {
    // silent fail, use defaults
  }
  return null;
}

// ====================================================
// Mosaic Application
// ====================================================

function applyMosaic(
  ctx: CanvasRenderingContext2D,
  detections: MosaicDetection[],
  w: number,
  h: number
): void {
  if (detections.length === 0) {
    console.log('[MOSAIC] No privacy regions to mosaic');
    return;
  }

  console.log('[MOSAIC] Applying to', detections.length, 'regions');
  const blockSize = 10;

  for (let i = 0; i < detections.length; i++) {
    const det = detections[i];

    let rx = (det.x * w) / 100;
    let ry = (det.y * h) / 100;
    let rw = (det.width * w) / 100;
    let rh = (det.height * h) / 100;

    // Generous padding
    const pad = 0.3;
    const px = rw * pad;
    const py = rh * pad;
    rx = Math.max(0, rx - px);
    ry = Math.max(0, ry - py);
    rw = Math.min(w - rx, rw + px * 2);
    rh = Math.min(h - ry, rh + py * 2);

    if (rw < 30) { rx = Math.max(0, rx - (30 - rw) / 2); rw = 30; }
    if (rh < 15) { ry = Math.max(0, ry - (15 - rh) / 2); rh = 15; }

    const fx = Math.floor(rx);
    const fy = Math.floor(ry);
    const fw = Math.floor(rw);
    const fh = Math.floor(rh);

    console.log(`[MOSAIC] #${i} ${det.type}: ${fx},${fy} ${fw}x${fh}`);

    for (let by = fy; by < fy + fh; by += blockSize) {
      for (let bx = fx; bx < fx + fw; bx += blockSize) {
        const sx = Math.min(bx, w - 1);
        const sy = Math.min(by, h - 1);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
        ctx.fillRect(bx, by, Math.min(blockSize, fx + fw - bx), Math.min(blockSize, fy + fh - by));
      }
    }
  }
  console.log('[MOSAIC] Complete');
}

// ====================================================
// Enhancement Pipeline
// ====================================================

function applyEnhancement(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: typeof DEFAULT_ENHANCE_PARAMS
): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      const lift = params.shadow_lift * (1 - lum / 80) * 40;
      r = Math.min(255, r + lift);
      g = Math.min(255, g + lift);
      b = Math.min(255, b + lift);
    }
    if (lum > 200) {
      const rec = ((params.highlight_recovery * (lum - 200)) / 55) * 30;
      r = Math.max(0, r - rec);
      g = Math.max(0, g - rec);
      b = Math.max(0, b - rec);
    }

    const cs = params.contrast_strength;
    const sc = (v: number) => {
      const n = v / 255;
      return Math.min(255, Math.max(0, 255 * (n + cs * Math.sin(Math.PI * n) * 0.5)));
    };
    r = sc(r); g = sc(g); b = sc(b);

    const mc = Math.min(r, g, b);
    if (mc > 50) {
      const hz = params.dehaze_strength * (mc - 50) * 0.3;
      r = Math.min(255, r + hz * 0.5);
      g = Math.min(255, g + hz * 0.3);
      b = Math.max(0, b - hz * 0.2);
    }

    const avg = (r + g + b) / 3;
    const mx = Math.max(r, g, b);
    const sat = mx > 0 ? 1 - Math.min(r, g, b) / mx : 0;
    const vb = params.vibrance * (1 - sat) * 0.5;
    r = Math.min(255, r + (r - avg) * vb);
    g = Math.min(255, g + (g - avg) * vb);
    b = Math.min(255, b + (b - avg) * vb);

    r = Math.min(255, Math.max(0, r + params.color_temperature * 15));
    b = Math.min(255, Math.max(0, b - params.color_temperature * 15));

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(imageData, 0, 0);

  const sd = ctx.getImageData(0, 0, w, h);
  const s = sd.data;
  const cp = new Uint8ClampedArray(s);
  const amt = params.sharpen_detail;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (cp[idx + c - 4] + cp[idx + c + 4] + cp[idx + c - w * 4] + cp[idx + c + w * 4]) / 4;
        s[idx + c] = Math.min(255, Math.max(0, cp[idx + c] + (cp[idx + c] - blur) * amt));
      }
    }
  }
  ctx.putImageData(sd, 0, 0);

  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${params.vignette_strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ====================================================
// Main Export
// ====================================================

export async function enhanceImage(file: File): Promise<string> {
  console.log('[ENHANCE] Starting:', file.name, file.size, 'bytes');

  const dataUrl = await readFileAsDataURL(file);
  const maxDim = 1600;

  let apiDataUrl = dataUrl;
  if (dataUrl.length > 3 * 1024 * 1024) {
    apiDataUrl = await resizeImageForAPI(dataUrl, maxDim);
  }

  const img = await loadImage(dataUrl);
  console.log('[ENHANCE] Image:', img.width, 'x', img.height);

  const canvas = document.createElement('canvas');
  let w = img.width, h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // Run privacy detection + enhancement params in parallel (both API calls)
  console.log('[ENHANCE] Starting parallel API calls...');
  const [privacyDets, enhanceParams] = await Promise.all([
    detectAllPrivacy(apiDataUrl),
    fetchEnhanceParams(apiDataUrl),
  ]);

  const params = enhanceParams || DEFAULT_ENHANCE_PARAMS;
  console.log('[ENHANCE] Privacy:', privacyDets.length, 'items detected');

  applyEnhancement(ctx, w, h, params);
  applyMosaic(ctx, privacyDets, w, h);

  const result = canvas.toDataURL('image/webp', 0.93);
  console.log('[ENHANCE] Done! Output:', result.length, 'bytes');
  return result;
                           }
