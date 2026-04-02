// src/lib/imageHelpers.ts
// Privacy-first image enhancement
// Phone number detection: Tesseract.js OCR (precise bounding boxes)
// Face/plate detection: Claude API (grid-based)

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
// Tesseract.js OCR - Phone Number Detection (PRECISE)
// ====================================================

let tesseractPromise: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error('Tesseract.js load failed'));
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

// Pre-process image for better OCR: grayscale + binary threshold
function preprocessForOCR(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const val = gray < 128 ? 0 : 255;
        d[i] = val; d[i + 1] = val; d[i + 2] = val;
      }
      ctx.putImageData(id, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

const PHONE_REGEX = /\d{2,4}[-. ]?\d{3,4}[-. ]?\d{4}/;
const HP_REGEX = /[HhTt]\.?[PpEeLl]\.?/;

async function detectPhoneNumbersOCR(dataUrl: string): Promise<MosaicDetection[]> {
  console.log('[OCR] Starting Tesseract phone detection...');
  try {
    const Tesseract = await loadTesseract();
    console.log('[OCR] Pre-processing image...');
    const processedUrl = await preprocessForOCR(dataUrl);
    console.log('[OCR] Creating worker...');
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log('[OCR] Progress:', Math.round(m.progress * 100) + '%');
        }
      },
    });
    console.log('[OCR] Running recognition on pre-processed image...');
    const { data } = await worker.recognize(processedUrl);

    // Get original image dimensions for coordinate mapping
    const origImg = await loadImage(dataUrl);
    await worker.terminate();

    const detections: MosaicDetection[] = [];
    const imgW = origImg.width;
    const imgH = origImg.height;

    for (const line of (data.lines || [])) {
      const text = line.text.trim();
      if (PHONE_REGEX.test(text) || HP_REGEX.test(text)) {
        const b = line.bbox;
        const padX = (b.x1 - b.x0) * 0.15;
        const padY = (b.y1 - b.y0) * 0.3;
        const x0 = Math.max(0, b.x0 - padX);
        const y0 = Math.max(0, b.y0 - padY);
        const x1 = Math.min(imgW, b.x1 + padX);
        const y1 = Math.min(imgH, b.y1 + padY);
        detections.push({
          type: 'phone',
          x: (x0 / imgW) * 100,
          y: (y0 / imgH) * 100,
          width: ((x1 - x0) / imgW) * 100,
          height: ((y1 - y0) / imgH) * 100,
          confidence: (line.confidence || 50) / 100,
        });
        console.log('[OCR] Phone found:', text, 'at', b.x0, b.y0, b.x1, b.y1);
      }
    }

    for (const word of (data.words || [])) {
      const text = word.text.replace(/[^0-9\-. ]/g, '').trim();
      if (/^\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}$/.test(text)) {
        const b = word.bbox;
        const alreadyCovered = detections.some(d => {
          const dx = (d.x / 100) * imgW;
          const dy = (d.y / 100) * imgH;
          const dw = (d.width / 100) * imgW;
          const dh = (d.height / 100) * imgH;
          return b.x0 >= dx && b.y0 >= dy && b.x1 <= dx + dw && b.y1 <= dy + dh;
        });
        if (!alreadyCovered) {
          const padX = (b.x1 - b.x0) * 0.15;
          const padY = (b.y1 - b.y0) * 0.3;
          detections.push({
            type: 'phone',
            x: (Math.max(0, b.x0 - padX) / imgW) * 100,
            y: (Math.max(0, b.y0 - padY) / imgH) * 100,
            width: (Math.min(imgW, b.x1 - b.x0 + padX * 2) / imgW) * 100,
            height: (Math.min(imgH, b.y1 - b.y0 + padY * 2) / imgH) * 100,
            confidence: (word.confidence || 50) / 100,
          });
        }
      }
    }

    console.log('[OCR] Total phone detections:', detections.length);
    return detections;
  } catch (err) {
    console.error('[OCR] Failed:', err);
    return [];
  }
}
// ====================================================
// Claude API - Face/Plate Detection (Grid-based)
// ====================================================

async function detectFacesAndPlates(apiDataUrl: string): Promise<MosaicDetection[]> {
  console.log('[PRIVACY] Calling Claude API for faces/plates...');
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
          const facePlate = data.detections.filter(
            (d: MosaicDetection) => d.type === 'face' || d.type === 'plate'
          );
          console.log('[PRIVACY] API found', facePlate.length, 'faces/plates');
          return facePlate;
        }
        console.log('[PRIVACY] API returned 0 face/plate detections');
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
    if (rw < 30) { rx = Math.max(0, rx - (30 - rw) / 2); rw = 30; }
    if (rh < 15) { ry = Math.max(0, ry - (15 - rh) / 2); rh = 15; }
    rx = Math.max(0, rx);
    ry = Math.max(0, ry);
    rw = Math.min(w - rx, rw);
    rh = Math.min(h - ry, rh);
    const fx = Math.floor(rx);
    const fy = Math.floor(ry);
    const fw = Math.floor(rw);
    const fh = Math.floor(rh);
    console.log('[MOSAIC] #' + i + ' ' + det.type + ': ' + fx + ',' + fy + ' ' + fw + 'x' + fh);
    for (let by = fy; by < fy + fh; by += blockSize) {
      for (let bx = fx; bx < fx + fw; bx += blockSize) {
        const sx = Math.min(bx, w - 1);
        const sy = Math.min(by, h - 1);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        ctx.fillStyle = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
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
  grad.addColorStop(1, 'rgba(0,0,0,' + params.vignette_strength + ')');
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

  // Run all detections in parallel:
  // 1. Tesseract OCR for phone numbers (precise pixel coordinates)
  // 2. Claude API for faces/plates (grid-based)
  // 3. Claude API for enhancement parameters
  console.log('[ENHANCE] Starting parallel detection...');
  const [ocrPhones, apiFacePlates, enhanceParams] = await Promise.all([
    detectPhoneNumbersOCR(apiDataUrl),
    detectFacesAndPlates(apiDataUrl),
    fetchEnhanceParams(apiDataUrl),
  ]);

  const allDetections = [...ocrPhones, ...apiFacePlates];
  const params = enhanceParams || DEFAULT_ENHANCE_PARAMS;
  console.log('[ENHANCE] Total detections:', allDetections.length,
    '(OCR phones:', ocrPhones.length, ', API faces/plates:', apiFacePlates.length, ')');

  applyEnhancement(ctx, w, h, params);
  applyMosaic(ctx, allDetections, w, h);

  const result = canvas.toDataURL('image/webp', 0.93);
  console.log('[ENHANCE] Done! Output:', result.length, 'bytes');
  return result;
              }
// src/lib/imageHelpers.ts
// Privacy-first image enhancement
// Phone number detection: Tesseract.js OCR (precise bounding boxes)
// Face/plate detection: Claude API (grid-based)

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
// Tesseract.js OCR - Phone Number Detection (PRECISE)
// ====================================================

let tesseractPromise: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error('Tesseract.js load failed'));
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

const PHONE_REGEX = /\d{2,4}[-. ]?\d{3,4}[-. ]?\d{4}/;
const HP_REGEX = /[HhTt]\.?[PpEeLl]\.?/;

async function detectPhoneNumbersOCR(dataUrl: string): Promise<MosaicDetection[]> {
  console.log('[OCR] Starting Tesseract phone detection...');
  try {
    const Tesseract = await loadTesseract();
    console.log('[OCR] Tesseract loaded, creating worker...');
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log('[OCR] Progress:', Math.round(m.progress * 100) + '%');
        }
      },
    });
    console.log('[OCR] Running recognition...');
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();

    const detections: MosaicDetection[] = [];
    const imgW = data.width || 1;
    const imgH = data.height || 1;

    for (const line of (data.lines || [])) {
      const text = line.text.trim();
      if (PHONE_REGEX.test(text) || HP_REGEX.test(text)) {
        const b = line.bbox;
        const padX = (b.x1 - b.x0) * 0.15;
        const padY = (b.y1 - b.y0) * 0.3;
        const x0 = Math.max(0, b.x0 - padX);
        const y0 = Math.max(0, b.y0 - padY);
        const x1 = Math.min(imgW, b.x1 + padX);
        const y1 = Math.min(imgH, b.y1 + padY);
        detections.push({
          type: 'phone',
          x: (x0 / imgW) * 100,
          y: (y0 / imgH) * 100,
          width: ((x1 - x0) / imgW) * 100,
          height: ((y1 - y0) / imgH) * 100,
          confidence: (line.confidence || 50) / 100,
        });
        console.log('[OCR] Phone found:', text, 'at', b.x0, b.y0, b.x1, b.y1);
      }
    }

    for (const word of (data.words || [])) {
      const text = word.text.replace(/[^0-9\-. ]/g, '').trim();
      if (/^\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}$/.test(text)) {
        const b = word.bbox;
        const alreadyCovered = detections.some(d => {
          const dx = (d.x / 100) * imgW;
          const dy = (d.y / 100) * imgH;
          const dw = (d.width / 100) * imgW;
          const dh = (d.height / 100) * imgH;
          return b.x0 >= dx && b.y0 >= dy && b.x1 <= dx + dw && b.y1 <= dy + dh;
        });
        if (!alreadyCovered) {
          const padX = (b.x1 - b.x0) * 0.15;
          const padY = (b.y1 - b.y0) * 0.3;
          detections.push({
            type: 'phone',
            x: (Math.max(0, b.x0 - padX) / imgW) * 100,
            y: (Math.max(0, b.y0 - padY) / imgH) * 100,
            width: (Math.min(imgW, b.x1 - b.x0 + padX * 2) / imgW) * 100,
            height: (Math.min(imgH, b.y1 - b.y0 + padY * 2) / imgH) * 100,
            confidence: (word.confidence || 50) / 100,
          });
        }
      }
    }

    console.log('[OCR] Total phone detections:', detections.length);
    return detections;
  } catch (err) {
    console.error('[OCR] Failed:', err);
    return [];
  }
}
// ====================================================
// Claude API - Face/Plate Detection (Grid-based)
// ====================================================

async function detectFacesAndPlates(apiDataUrl: string): Promise<MosaicDetection[]> {
  console.log('[PRIVACY] Calling Claude API for faces/plates...');
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
          const facePlate = data.detections.filter(
            (d: MosaicDetection) => d.type === 'face' || d.type === 'plate'
          );
          console.log('[PRIVACY] API found', facePlate.length, 'faces/plates');
          return facePlate;
        }
        console.log('[PRIVACY] API returned 0 face/plate detections');
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
    if (rw < 30) { rx = Math.max(0, rx - (30 - rw) / 2); rw = 30; }
    if (rh < 15) { ry = Math.max(0, ry - (15 - rh) / 2); rh = 15; }
    rx = Math.max(0, rx);
    ry = Math.max(0, ry);
    rw = Math.min(w - rx, rw);
    rh = Math.min(h - ry, rh);
    const fx = Math.floor(rx);
    const fy = Math.floor(ry);
    const fw = Math.floor(rw);
    const fh = Math.floor(rh);
    console.log('[MOSAIC] #' + i + ' ' + det.type + ': ' + fx + ',' + fy + ' ' + fw + 'x' + fh);
    for (let by = fy; by < fy + fh; by += blockSize) {
      for (let bx = fx; bx < fx + fw; bx += blockSize) {
        const sx = Math.min(bx, w - 1);
        const sy = Math.min(by, h - 1);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        ctx.fillStyle = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
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
  grad.addColorStop(1, 'rgba(0,0,0,' + params.vignette_strength + ')');
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

  // Run all detections in parallel:
  // 1. Tesseract OCR for phone numbers (precise pixel coordinates)
  // 2. Claude API for faces/plates (grid-based)
  // 3. Claude API for enhancement parameters
  console.log('[ENHANCE] Starting parallel detection...');
  const [ocrPhones, apiFacePlates, enhanceParams] = await Promise.all([
    detectPhoneNumbersOCR(apiDataUrl),
    detectFacesAndPlates(apiDataUrl),
    fetchEnhanceParams(apiDataUrl),
  ]);

  const allDetections = [...ocrPhones, ...apiFacePlates];
  const params = enhanceParams || DEFAULT_ENHANCE_PARAMS;
  console.log('[ENHANCE] Total detections:', allDetections.length,
    '(OCR phones:', ocrPhones.length, ', API faces/plates:', apiFacePlates.length, ')');

  applyEnhancement(ctx, w, h, params);
  applyMosaic(ctx, allDetections, w, h);

  const result = canvas.toDataURL('image/webp', 0.93);
  console.log('[ENHANCE] Done! Output:', result.length, 'bytes');
  return result;
              }
