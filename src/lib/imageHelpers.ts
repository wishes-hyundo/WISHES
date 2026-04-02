// src/lib/imageHelpers.ts
// Privacy-first image enhancement with 3-tier detection:
// 1. face-api.js → Faces (neural network, pixel-accurate)
// 2. Tesseract.js → Phone numbers, ID numbers (OCR, exact positions)
// 3. Claude API → License plates, documents (LLM vision)
// 
// NOTE: Uses npm packages (bundled) instead of CDN scripts to avoid CSP issues

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
// TIER 1-A: Face Detection (face-api.js neural network)
// Uses npm package: @vladmandic/face-api
// ====================================================

let faceModelLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapiModule: any = null;

async function detectFaces(canvas: HTMLCanvasElement): Promise<MosaicDetection[]> {
  try {
    // Dynamic import from npm package (bundled by Next.js)
    if (!faceapiModule) {
      console.log('[FACE] Loading face-api.js from npm package...');
      faceapiModule = await import('@vladmandic/face-api');
      console.log('[FACE] face-api.js loaded from bundle');
    }

    const faceapi = faceapiModule;

    // Load face detection model (still from CDN - uses fetch, not script tag)
    if (!faceModelLoaded) {
      console.log('[FACE] Loading detection model...');
      const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
        console.log('[FACE] SSD MobileNet model loaded');
      } catch {
        console.log('[FACE] SSD failed, trying TinyFaceDetector...');
        await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
        console.log('[FACE] TinyFaceDetector model loaded');
      }
      faceModelLoaded = true;
    }

    // Run face detection
    console.log('[FACE] Detecting faces...');
    let detectorOptions: unknown;
    if (faceapi.nets.ssdMobilenetv1.isLoaded) {
      detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
    } else {
      detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.3,
      });
    }

    const rawDetections = await faceapi.detectAllFaces(canvas, detectorOptions).run();

    const w = canvas.width;
    const h = canvas.height;
    const results: MosaicDetection[] = rawDetections.map((det: { detection: { box: { x: number; y: number; width: number; height: number } }; score: number }) => ({
      type: 'face',
      x: (det.detection.box.x / w) * 100,
      y: (det.detection.box.y / h) * 100,
      width: (det.detection.box.width / w) * 100,
      height: (det.detection.box.height / h) * 100,
      confidence: det.score,
    }));

    console.log('[FACE] Detected', results.length, 'faces');
    return results;
  } catch (err) {
    console.error('[FACE] Detection failed:', err);
    return [];
  }
}

// ====================================================
// TIER 1-B: Text Privacy Detection (Tesseract.js OCR)
// Uses npm package: tesseract.js
// ====================================================

// Korean phone: 010-3797-1280, 02-1234-5678, 031-123-4567
const PHONE_REGEX = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
// Korean RRN: 880101-1234567
const RRN_REGEX = /\d{6}[-.\s]?\d{7}/;

interface OCRWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

function findPrivacyText(
  words: OCRWord[],
  cw: number,
  ch: number
): MosaicDetection[] {
  if (!words || words.length === 0) return [];

  // Sort words: top→bottom, left→right
  const sorted = [...words].sort((a, b) => {
    const ha = a.bbox.y1 - a.bbox.y0 || 20;
    const dy = a.bbox.y0 - b.bbox.y0;
    return Math.abs(dy) > ha * 0.5 ? dy : a.bbox.x0 - b.bbox.x0;
  });

  // Group into lines
  const lines: OCRWord[][] = [];
  let curLine: OCRWord[] = [];
  let lineY = -999;

  for (const w of sorted) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const wh = w.bbox.y1 - w.bbox.y0 || 20;
    if (lineY < 0 || Math.abs(cy - lineY) > wh * 0.6) {
      if (curLine.length > 0) lines.push(curLine);
      curLine = [w];
      lineY = cy;
    } else {
      curLine.push(w);
      lineY = (lineY + cy) / 2;
    }
  }
  if (curLine.length > 0) lines.push(curLine);

  const dets: MosaicDetection[] = [];

  for (const line of lines) {
    const raw = line.map((w) => w.text).join(' ');

    // Fix OCR misreads for digits
    const cleaned = raw
      .replace(/[OoQ]/g, '0')
      .replace(/[IlL|]/g, '1')
      .replace(/[S]/g, '5')
      .replace(/[Z]/g, '2')
      .replace(/[B]/g, '8');

    const isPhone = PHONE_REGEX.test(cleaned);
    const isRRN = RRN_REGEX.test(cleaned);

    if (isPhone || isRRN) {
      const digitWords = line.filter(
        (w) => /\d/.test(w.text) || /^[-.:]+ $/.test(w.text.trim())
      );

      if (digitWords.length > 0) {
        const x0 = Math.min(...digitWords.map((w) => w.bbox.x0));
        const y0 = Math.min(...digitWords.map((w) => w.bbox.y0));
        const x1 = Math.max(...digitWords.map((w) => w.bbox.x1));
        const y1 = Math.max(...digitWords.map((w) => w.bbox.y1));

        dets.push({
          type: isRRN ? 'rrn' : 'phone',
          x: (x0 / cw) * 100,
          y: (y0 / ch) * 100,
          width: ((x1 - x0) / cw) * 100,
          height: ((y1 - y0) / ch) * 100,
          confidence: 0.95,
        });

        console.log('[OCR]', isRRN ? 'RRN' : 'Phone', 'found:', raw.trim());
      }
    }
  }

  console.log('[OCR] Found', dets.length, 'text privacy regions');
  return dets;
}

async function detectTextPrivacy(canvas: HTMLCanvasElement): Promise<MosaicDetection[]> {
  try {
    // Dynamic import from npm package (bundled by Next.js)
    console.log('[OCR] Loading Tesseract.js from npm package...');
    const Tesseract = await import('tesseract.js');
    console.log('[OCR] Tesseract.js loaded from bundle');

    console.log('[OCR] Creating worker...');
    const worker = await Tesseract.createWorker('eng');

    console.log('[OCR] Recognizing text on', canvas.width, 'x', canvas.height, '...');
    const { data } = await worker.recognize(canvas);
    await worker.terminate();

    console.log('[OCR] Found', data.words?.length, 'words');
    if (data.text) console.log('[OCR] Text preview:', data.text.substring(0, 200));

    return findPrivacyText(data.words as OCRWord[], canvas.width, canvas.height);
  } catch (err) {
    console.error('[OCR] Failed:', err);
    return [];
  }
}

// ====================================================
// TIER 2: Visual Detection (Claude API - plates & docs)
// ====================================================

async function detectVisualPrivacy(apiDataUrl: string): Promise<MosaicDetection[]> {
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
          // ONLY keep plate and document detections
          const visual = data.detections.filter(
            (d: MosaicDetection) => d.type === 'plate' || d.type === 'document'
          );
          console.log(
            '[API] Returned',
            data.detections.length,
            'total → kept',
            visual.length,
            'visual (plate/document)'
          );
          return visual;
        }
      }

      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.log('[API] Attempt', attempt, 'failed:', err);
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

    // Convert % to pixels
    let rx = (det.x * w) / 100;
    let ry = (det.y * h) / 100;
    let rw = (det.width * w) / 100;
    let rh = (det.height * h) / 100;

    // Padding varies by detection source
    const pad = det.type === 'plate' || det.type === 'document' ? 0.35 : 0.2;
    const px = rw * pad;
    const py = rh * pad;
    rx = Math.max(0, rx - px);
    ry = Math.max(0, ry - py);
    rw = Math.min(w - rx, rw + px * 2);
    rh = Math.min(h - ry, rh + py * 2);

    // Minimum sizes
    if (rw < 25) {
      rx = Math.max(0, rx - (25 - rw) / 2);
      rw = 25;
    }
    if (rh < 12) {
      ry = Math.max(0, ry - (12 - rh) / 2);
      rh = 12;
    }

    const fx = Math.floor(rx);
    const fy = Math.floor(ry);
    const fw = Math.floor(rw);
    const fh = Math.floor(rh);

    console.log(
      `[MOSAIC] #${i} ${det.type}: ${fx},${fy} ${fw}x${fh} (conf:${det.confidence.toFixed(2)})`
    );

    // Pixelate
    for (let by = fy; by < fy + fh; by += blockSize) {
      for (let bx = fx; bx < fx + fw; bx += blockSize) {
        const sx = Math.min(bx, w - 1);
        const sy = Math.min(by, h - 1);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
        ctx.fillRect(
          bx,
          by,
          Math.min(blockSize, fx + fw - bx),
          Math.min(blockSize, fy + fh - by)
        );
      }
    }
  }

  console.log('[MOSAIC] Complete');
}

// ====================================================
// 7-Step Enhancement Pipeline
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
    let r = d[i],
      g = d[i + 1],
      b = d[i + 2];

    // 1: HDR Shadow Lift
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      const lift = params.shadow_lift * (1 - lum / 80) * 40;
      r = Math.min(255, r + lift);
      g = Math.min(255, g + lift);
      b = Math.min(255, b + lift);
    }

    // 2: Highlight Recovery
    if (lum > 200) {
      const rec = ((params.highlight_recovery * (lum - 200)) / 55) * 30;
      r = Math.max(0, r - rec);
      g = Math.max(0, g - rec);
      b = Math.max(0, b - rec);
    }

    // 3: Cinematic S-Curve
    const cs = params.contrast_strength;
    const sc = (v: number) => {
      const n = v / 255;
      return Math.min(255, Math.max(0, 255 * (n + cs * Math.sin(Math.PI * n) * 0.5)));
    };
    r = sc(r);
    g = sc(g);
    b = sc(b);

    // 4: Dehaze
    const mc = Math.min(r, g, b);
    if (mc > 50) {
      const hz = params.dehaze_strength * (mc - 50) * 0.3;
      r = Math.min(255, r + hz * 0.5);
      g = Math.min(255, g + hz * 0.3);
      b = Math.max(0, b - hz * 0.2);
    }

    // 5: Smart Vibrance
    const avg = (r + g + b) / 3;
    const mx = Math.max(r, g, b);
    const sat = mx > 0 ? 1 - Math.min(r, g, b) / mx : 0;
    const vb = params.vibrance * (1 - sat) * 0.5;
    r = Math.min(255, r + (r - avg) * vb);
    g = Math.min(255, g + (g - avg) * vb);
    b = Math.min(255, b + (b - avg) * vb);

    // 6: Color Temperature
    r = Math.min(255, Math.max(0, r + params.color_temperature * 15));
    b = Math.min(255, Math.max(0, b - params.color_temperature * 15));

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imageData, 0, 0);

  // 7a: Unsharp Mask
  const sd = ctx.getImageData(0, 0, w, h);
  const s = sd.data;
  const cp = new Uint8ClampedArray(s);
  const amt = params.sharpen_detail;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur =
          (cp[idx + c - 4] + cp[idx + c + 4] + cp[idx + c - w * 4] + cp[idx + c + w * 4]) / 4;
        s[idx + c] = Math.min(
          255,
          Math.max(0, cp[idx + c] + (cp[idx + c] - blur) * amt)
        );
      }
    }
  }
  ctx.putImageData(sd, 0, 0);

  // 7b: Vignette
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${params.vignette_strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ====================================================
// Main Export: enhanceImage
// ====================================================

export async function enhanceImage(file: File): Promise<string> {
  console.log('[ENHANCE] Starting:', file.name, file.size, 'bytes');

  // Read & load
  const dataUrl = await readFileAsDataURL(file);
  const maxDim = 1600;

  let apiDataUrl = dataUrl;
  if (dataUrl.length > 3 * 1024 * 1024) {
    apiDataUrl = await resizeImageForAPI(dataUrl, maxDim);
  }

  const img = await loadImage(dataUrl);
  console.log('[ENHANCE] Image:', img.width, 'x', img.height);

  // Canvas setup
  const canvas = document.createElement('canvas');
  let w = img.width,
    h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // ========================================
  // Run ALL 4 tasks in parallel:
  // 1. Enhance params (Claude API)
  // 2. Face detection (face-api.js npm)
  // 3. Text privacy (Tesseract OCR npm)
  // 4. Visual privacy (Claude API - plates/docs)
  // ========================================
  console.log('[ENHANCE] Starting parallel detection...');

  const [enhanceParams, faces, textDets, visualDets] = await Promise.all([
    fetchEnhanceParams(apiDataUrl),
    detectFaces(canvas),
    detectTextPrivacy(canvas),
    detectVisualPrivacy(apiDataUrl),
  ]);

  const params = enhanceParams || DEFAULT_ENHANCE_PARAMS;
  const allDetections = [...faces, ...textDets, ...visualDets];

  console.log(
    '[ENHANCE] Detection complete:',
    faces.length,
    'faces,',
    textDets.length,
    'text,',
    visualDets.length,
    'visual,',
    '→ total:',
    allDetections.length
  );

  // Apply enhancement
  applyEnhancement(ctx, w, h, params);

  // Apply privacy mosaic
  applyMosaic(ctx, allDetections, w, h);

  // Export
  const result = canvas.toDataURL('image/webp', 0.93);
  console.log('[ENHANCE] Done! Output:', result.length, 'bytes');

  return result;
                                     }
