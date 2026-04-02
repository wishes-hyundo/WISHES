// src/lib/imageHelpers.ts
// Separated into its own module to prevent Terser from inlining
// helper functions back into the caller (which causes variable shadowing bugs)

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
    const resizeImg = new Image();
    resizeImg.onload = () => {
      let rw = resizeImg.width;
      let rh = resizeImg.height;
      if (rw > maxDim || rh > maxDim) {
        const ratio = Math.min(maxDim / rw, maxDim / rh);
        rw = Math.floor(rw * ratio);
        rh = Math.floor(rh * ratio);
      }
      const rc = document.createElement('canvas');
      rc.width = rw;
      rc.height = rh;
      const rcx = rc.getContext('2d')!;
      rcx.drawImage(resizeImg, 0, 0, rw, rh);
      resolve(rc.toDataURL('image/jpeg', 0.7));
    };
    resizeImg.src = dataUrl;
  });
}

async function callMosaicAPI(apiDataUrl: string, retries: number = 2): Promise<MosaicDetection[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: apiDataUrl, mode: 'mosaic' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.detections && data.detections.length > 0) {
          return data.detections;
        }
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.log('[MOSAIC] API attempt', attempt, 'failed:', err);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return [];
}

export async function enhanceImage(file: File): Promise<string> {
  console.log('[ENHANCE] Starting for file:', file.name, file.size);

  // Step 0: Read file as data URL
  const dataUrl = await readFileAsDataURL(file);
  console.log('[ENHANCE] File read OK, dataUrl length:', dataUrl.length);

  // Use consistent maxDim for both API and canvas
  const maxDim = 1600;

  // Resize for API (Vercel 4.5MB body limit)
  let apiDataUrl = dataUrl;
  if (dataUrl.length > 3 * 1024 * 1024) {
    apiDataUrl = await resizeImageForAPI(dataUrl, maxDim);
    console.log('[ENHANCE] Resized for API, new length:', apiDataUrl.length);
  }

  // Step 1: Get AI analysis - enhance params + mosaic detections in parallel
  let params = DEFAULT_ENHANCE_PARAMS;
  let mosaicDetections: MosaicDetection[] = [];

  try {
    const [enhanceRes, mosaicDets] = await Promise.all([
      fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: apiDataUrl, mode: 'enhance' }),
      }).then(async (r) => {
        if (r.ok) {
          const data: EnhanceAnalysisResult = await r.json();
          return data.parameters || null;
        }
        return null;
      }).catch(() => null),
      callMosaicAPI(apiDataUrl, 2),
    ]);

    if (enhanceRes) params = enhanceRes;
    mosaicDetections = mosaicDets;
  } catch (apiErr) {
    console.log('[ENHANCE] API error, using defaults:', apiErr);
  }

  console.log('[ENHANCE] Params:', JSON.stringify(params));
  console.log('[ENHANCE] Mosaic detections:', mosaicDetections.length, JSON.stringify(mosaicDetections));

  // Step 2: Load image for canvas processing
  const img = await loadImage(dataUrl);
  console.log('[ENHANCE] Image loaded:', img.width, 'x', img.height);

  // Step 3: Canvas setup - use same maxDim constraint for consistency with API
  const canvas = document.createElement('canvas');
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // === 7-Step Enhancement Pipeline ===
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const len = d.length;

  for (let i = 0; i < len; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // Step 1: HDR Shadow Lift
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      const lift = params.shadow_lift * (1 - lum / 80) * 40;
      r = Math.min(255, r + lift);
      g = Math.min(255, g + lift);
      b = Math.min(255, b + lift);
    }

    // Step 2: Highlight Recovery
    if (lum > 200) {
      const recovery = params.highlight_recovery * (lum - 200) / 55 * 30;
      r = Math.max(0, r - recovery);
      g = Math.max(0, g - recovery);
      b = Math.max(0, b - recovery);
    }

    // Step 3: Cinematic S-Curve
    const contrastStrength = params.contrast_strength;
    const applyScurve = (v: number): number => {
      const n = v / 255;
      return Math.min(255, Math.max(0, 255 * (n + contrastStrength * Math.sin(Math.PI * n) * 0.5)));
    };
    r = applyScurve(r);
    g = applyScurve(g);
    b = applyScurve(b);

    // Step 4: Dehaze
    const dehazeStr = params.dehaze_strength;
    const minChannel = Math.min(r, g, b);
    if (minChannel > 50) {
      const haze = dehazeStr * (minChannel - 50) * 0.3;
      r = Math.min(255, r + haze * 0.5);
      g = Math.min(255, g + haze * 0.3);
      b = Math.max(0, b - haze * 0.2);
    }

    // Step 5: Smart Vibrance
    const avg = (r + g + b) / 3;
    const maxChannel = Math.max(r, g, b);
    const sat = maxChannel > 0 ? 1 - (Math.min(r, g, b) / maxChannel) : 0;
    const vib = params.vibrance * (1 - sat) * 0.5;
    r = Math.min(255, r + (r - avg) * vib);
    g = Math.min(255, g + (g - avg) * vib);
    b = Math.min(255, b + (b - avg) * vib);

    // Step 6: Color Temperature
    const temp = params.color_temperature;
    r = Math.min(255, Math.max(0, r + temp * 15));
    b = Math.min(255, Math.max(0, b - temp * 15));

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imageData, 0, 0);

  // Step 7a: Unsharp Mask
  const sharpData = ctx.getImageData(0, 0, w, h);
  const sd = sharpData.data;
  const copy = new Uint8ClampedArray(sd);
  const amount = params.sharpen_detail;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (copy[idx + c - 4] + copy[idx + c + 4] +
                      copy[idx + c - w * 4] + copy[idx + c + w * 4]) / 4;
        sd[idx + c] = Math.min(255, Math.max(0,
          copy[idx + c] + (copy[idx + c] - blur) * amount));
      }
    }
  }
  ctx.putImageData(sharpData, 0, 0);

  // Step 7b: Vignette
  const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${params.vignette_strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Step 8: Privacy Mosaic with generous padding
  if (mosaicDetections.length > 0) {
    console.log('[ENHANCE] Applying mosaic to', mosaicDetections.length, 'detections');
    const blockSize = 12; // smaller blocks for finer mosaic
    const PADDING = 0.4; // 40% padding on each side

    for (let di = 0; di < mosaicDetections.length; di++) {
      const det = mosaicDetections[di];

      // Convert percentage coords to pixels
      let mx = det.x * w / 100;
      let my = det.y * h / 100;
      let mw = det.width * w / 100;
      let mh = det.height * h / 100;

      // Add generous padding (40% on each side)
      const padX = mw * PADDING;
      const padY = mh * PADDING;
      mx = Math.max(0, mx - padX);
      my = Math.max(0, my - padY);
      mw = Math.min(w - mx, mw + padX * 2);
      mh = Math.min(h - my, mh + padY * 2);

      // Ensure minimum mosaic size (at least 40x20 pixels)
      if (mw < 40) { mx = Math.max(0, mx - (40 - mw) / 2); mw = 40; }
      if (mh < 20) { my = Math.max(0, my - (20 - mh) / 2); mh = 20; }

      const fx = Math.floor(mx);
      const fy = Math.floor(my);
      const fw = Math.floor(mw);
      const fh = Math.floor(mh);

      console.log('[ENHANCE] Mosaic region', di, ':', fx, fy, fw, fh, 'type:', det.type, 'conf:', det.confidence);

      for (let by = fy; by < fy + fh; by += blockSize) {
        for (let bx = fx; bx < fx + fw; bx += blockSize) {
          const sx = Math.min(bx, w - 1);
          const sy = Math.min(by, h - 1);
          const pixel = ctx.getImageData(sx, sy, 1, 1).data;
          ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
          const bw = Math.min(blockSize, fx + fw - bx);
          const bh = Math.min(blockSize, fy + fh - by);
          ctx.fillRect(bx, by, bw, bh);
        }
      }
    }
    console.log('[ENHANCE] Mosaic applied successfully');
  } else {
    console.log('[ENHANCE] No mosaic detections to apply');
  }

  // Export as WebP 93% quality
  const result = canvas.toDataURL('image/webp', 0.93);
  console.log('[ENHANCE] Success! Result length:', result.length);
  return result;
}
