'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AnalysisResult {
  analysis?: { overall_quality: string; issues: string[] };
  parameters?: {
    shadow_lift: number; highlight_recovery: number; contrast_strength: number;
    dehaze_strength: number; vibrance: number; sharpen_detail: number;
    sharpen_edge: number; color_temperature: number; vignette_strength: number;
  };
}

interface MosaicDetection {
  type: string; x: number; y: number; width: number; height: number; confidence: number;
}

const STEPS = [
  { name: 'HDR 그림자 리프트', desc: '어두운 구석 디테일 복구' },
  { name: '하이라이트 리커버리', desc: '날아간 밝은 부분 복원' },
  { name: '시네마틱 S-커브', desc: '명암 깊이감 향상' },
  { name: '디헤이즈', desc: '뿌연 안개 제거' },
  { name: '스마트 바이브런스', desc: '색감 선택적 강화' },
  { name: '언샤프마스크 2패스', desc: '선명도 향상' },
  { name: '비네팅', desc: '매물에 시선 집중' },
];

export default function PhotoEnhancer() {
  const router = useRouter();
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [mosaicAreas, setMosaicAreas] = useState<MosaicDetection[]>([]);
  const [sliderPos, setSliderPos] = useState(50);
  const [error, setError] = useState<string | null>(null);
  // L-photo-role (2026-04-24): admin/superadmin 전용. agent 이하 차단.
  //   사진 보정 + 모자이크 도구는 매물 관리 권한과 개인정보 처리 책임이 있는
  //   관리자만 사용해야 하므로 role gate 를 클라이언트에서 우선 추가.
  //   API 레벨 추가 보호는 /api/analyze-photo 와 /api/mosaic-image 쪽 과제.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('ws_user') || window.sessionStorage.getItem('ws_user');
      const u = raw ? JSON.parse(raw) : null;
      const role = (u?.role || '').toLowerCase();
      if (role !== 'superadmin' && role !== 'admin') {
        alert('사진 자동보정은 관리자 권한이 필요합니다.');
        router.replace('/admin');
      }
    } catch {
      alert('권한 확인에 실패했습니다. 다시 로그인해주세요.');
      router.replace('/login?redirect=/admin/');
    }
  }, [router]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setError(null);
    setEnhancedImage(null);
    setAnalysis(null);
    setMosaicAreas([]);
    setCurrentStep(-1);
    const reader = new FileReader();
    reader.onload = (e) => setOriginalImage(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── 7-Step Enhancement Engine ──
  const applyEnhancement = useCallback((imageData: ImageData, params: AnalysisResult['parameters']) => {
    if (!params) return imageData;
    const d = imageData.data;
    const len = d.length;

    for (let i = 0; i < len; i += 4) {
      let r = d[i], g = d[i+1], b = d[i+2];

      // Step 1: HDR Shadow Lift
      const lum = 0.299*r + 0.587*g + 0.114*b;
      if (lum < 80) {
        const lift = params.shadow_lift * (1 - lum/80) * 40;
        r = Math.min(255, r + lift);
        g = Math.min(255, g + lift);
        b = Math.min(255, b + lift);
      }

      // Step 2: Highlight Recovery
      if (lum > 200) {
        const recovery = params.highlight_recovery * (lum-200)/55 * 30;
        r = Math.max(0, r - recovery);
        g = Math.max(0, g - recovery);
        b = Math.max(0, b - recovery);
      }

      // Step 3: Cinematic S-Curve
      const s = params.contrast_strength;
      const normalize = (v: number) => v / 255;
      const sCurve = (v: number) => {
        const n = normalize(v);
        return Math.min(255, Math.max(0, 255 * (n + s * Math.sin(Math.PI * n) * 0.5)));
      };
      r = sCurve(r); g = sCurve(g); b = sCurve(b);

      // Step 4: Dehaze
      const dh = params.dehaze_strength;
      const minC = Math.min(r, g, b);
      if (minC > 50) {
        const haze = dh * (minC - 50) * 0.3;
        r = Math.min(255, r + haze * 0.5);
        g = Math.min(255, g + haze * 0.3);
        b = Math.max(0, b - haze * 0.2);
      }

      // Step 5: Smart Vibrance
      const avg = (r + g + b) / 3;
      const maxC = Math.max(r, g, b);
      const sat = maxC > 0 ? 1 - (Math.min(r,g,b)/maxC) : 0;
      const vib = params.vibrance * (1 - sat) * 0.5;
      r = Math.min(255, r + (r - avg) * vib);
      g = Math.min(255, g + (g - avg) * vib);
      b = Math.min(255, b + (b - avg) * vib);

      // Step 6: Color Temperature
      const temp = params.color_temperature;
      r = Math.min(255, Math.max(0, r + temp * 15));
      b = Math.min(255, Math.max(0, b - temp * 15));

      d[i] = Math.min(255, Math.max(0, r));
      d[i+1] = Math.min(255, Math.max(0, g));
      d[i+2] = Math.min(255, Math.max(0, b));
    }
    return imageData;
  }, []);

  // ── Unsharp Mask ──
  const applySharpen = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, params: AnalysisResult['parameters']) => {
    if (!params) return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const copy = new Uint8ClampedArray(d);
    const amount = params.sharpen_detail;

    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const idx = (y*w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const blur = (copy[idx+c-4] + copy[idx+c+4] + copy[idx+c-w*4] + copy[idx+c+w*4]) / 4;
          d[idx+c] = Math.min(255, Math.max(0, copy[idx+c] + (copy[idx+c] - blur) * amount));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  // ── Vignette ──
  const applyVignette = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) => {
    const gradient = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.8);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, []);

  // ── Mosaic ──
  const applyMosaic = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, detections: MosaicDetection[]) => {
    const blockSize = 20;
    detections.forEach(det => {
      const x = Math.floor(det.x * w / 100);
      const y = Math.floor(det.y * h / 100);
      const mw = Math.floor(det.width * w / 100);
      const mh = Math.floor(det.height * h / 100);

      for (let by = y; by < y + mh; by += blockSize) {
        for (let bx = x; bx < x + mw; bx += blockSize) {
          const pixel = ctx.getImageData(bx, by, 1, 1).data;
          ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
          ctx.fillRect(bx, by, blockSize, blockSize);
        }
      }
    });
  }, []);

  // ── Main Enhancement Process ──
  const startEnhancement = useCallback(async () => {
    if (!originalImage) return;
    setError(null);
    setIsAnalyzing(true);
    setCurrentStep(0);

    try {
      // Step 1: AI Analysis for enhancement parameters
      const enhanceRes = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: originalImage, mode: 'enhance' }),
      });

      if (!enhanceRes.ok) throw new Error('AI analysis failed');
      const enhanceData: AnalysisResult = await enhanceRes.json();
      setAnalysis(enhanceData);

      // Step 2: AI Analysis for privacy detection
      setCurrentStep(1);
      const mosaicRes = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: originalImage, mode: 'mosaic' }),
      });

      let mosaicData: { detections: MosaicDetection[] } = { detections: [] };
      if (mosaicRes.ok) {
        mosaicData = await mosaicRes.json();
        setMosaicAreas(mosaicData.detections || []);
      }

      setIsAnalyzing(false);
      setIsEnhancing(true);

      // Step 3: Apply 7-step enhancement
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Target size: 1200x800
        const tw = 1200, th = 800;
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d')!;

        // Smart crop to center
        const scale = Math.max(tw / img.width, th / img.height);
        const sw = tw / scale, sh = th / scale;
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);

        // Apply pixel-level enhancements (Steps 1-5)
        for (let step = 0; step < 5; step++) {
          setCurrentStep(step + 2);
          const imageData = ctx.getImageData(0, 0, tw, th);
          applyEnhancement(imageData, enhanceData.parameters);
          ctx.putImageData(imageData, 0, 0);
        }

        // Step 6: Sharpen
        setCurrentStep(7);
        applySharpen(ctx, tw, th, enhanceData.parameters);

        // Step 7: Vignette
        setCurrentStep(8);
        applyVignette(ctx, tw, th, enhanceData.parameters?.vignette_strength || 0.2);

        // Apply mosaic for privacy
        if (mosaicData.detections?.length > 0) {
          applyMosaic(ctx, tw, th, mosaicData.detections);
        }

        // Export as WebP 93%
        const webpUrl = canvas.toDataURL('image/webp', 0.93);
        setEnhancedImage(webpUrl);
        setIsEnhancing(false);
        setCurrentStep(-1);
      };
      img.src = originalImage;
    } catch (err) {
      setError(String(err));
      setIsAnalyzing(false);
      setIsEnhancing(false);
    }
  }, [originalImage, applyEnhancement, applySharpen, applyVignette, applyMosaic]);

  // ── Slider interaction ──
  const handleSliderMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  }, []);

  const downloadImage = useCallback(() => {
    if (!enhancedImage) return;
    const a = document.createElement('a');
    a.href = enhancedImage;
    a.download = `wishes_enhanced_${Date.now()}.webp`;
    a.click();
  }, [enhancedImage]);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7f0', fontFamily: 'Pretendard, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B5E20, #388E3C)', padding: '20px 30px', color: '#fff', display: 'flex', alignItems: 'center', gap: 15 }}>
        <span style={{ fontSize: 28 }}>&#x1f4f7;</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>WISHES AI &#xb9e4;&#xbb3c;&#xc0ac;&#xc9c4; &#xc790;&#xb3d9;&#xbcf4;&#xc815;</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>7&#xb2e8;&#xacc4; &#xd504;&#xb85c; &#xbcf4;&#xc815; + &#xac1c;&#xc778;&#xc815;&#xbcf4; &#xc790;&#xb3d9; &#xbaa8;&#xc790;&#xc774;&#xd06c;</p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '30px auto', padding: '0 20px' }}>
        {/* Upload Area */}
        {!originalImage && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '3px dashed #388E3C', borderRadius: 16, padding: '60px 40px',
              textAlign: 'center', cursor: 'pointer', background: '#fff',
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 16 }}>&#x1f4f7;</div>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#1B5E20', margin: '0 0 8px' }}>
              &#xb9e4;&#xbb3c; &#xc0ac;&#xc9c4;&#xc744; &#xb4dc;&#xb798;&#xadf8;&#xd558;&#xac70;&#xb098; &#xd074;&#xb9ad;&#xd558;&#xc5ec; &#xcd94;&#xac00;
            </p>
            <p style={{ color: '#666', fontSize: 14 }}>JPG, PNG, WebP &#xc9c0;&#xc6d0; | &#xcd5c;&#xb300; 20MB</p>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
          </div>
        )}

        {/* Processing Status */}
        {(isAnalyzing || isEnhancing) && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 30, marginTop: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h3 style={{ color: '#1B5E20', marginTop: 0 }}>
              {isAnalyzing ? '&#x1f916; AI &#xbd84;&#xc11d; &#xc911;...' : '&#x2728; &#xbcf4;&#xc815; &#xc801;&#xc6a9; &#xc911;...'}
            </h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {STEPS.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  borderRadius: 8, background: currentStep > i + 1 ? '#E8F5E9' : currentStep === i + 1 ? '#FFF3E0' : '#f5f5f5',
                  border: currentStep === i + 1 ? '1px solid #FF9800' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 18 }}>
                    {currentStep > i + 1 ? '\u2705' : currentStep === i + 1 ? '\u23f3' : '\u2B1C'}
                  </span>
                  <div>
                    <strong style={{ fontSize: 13 }}>{i+1}. {step.name}</strong>
                    <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result: Before/After Slider */}
        {originalImage && enhancedImage && !isEnhancing && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <h3 style={{ color: '#1B5E20', marginTop: 0 }}>&#xc804;&#xd6c4; &#xbe44;&#xad50; (&#xc88c;&#xc6b0; &#xb4dc;&#xb798;&#xadf8;)</h3>
              <div
                ref={sliderRef}
                onMouseMove={(e) => e.buttons === 1 && handleSliderMove(e)}
                onTouchMove={handleSliderMove}
                onMouseDown={handleSliderMove}
                style={{ position: 'relative', width: '100%', maxWidth: 800, margin: '0 auto', borderRadius: 12, overflow: 'hidden', cursor: 'ew-resize', userSelect: 'none', aspectRatio: '3/2' }}
              >
                <img src={enhancedImage} alt="enhanced" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, width: `${sliderPos}%`, height: '100%', overflow: 'hidden' }}>
                  <img src={originalImage} alt="original" style={{ width: `${100 / sliderPos * 100}%`, height: '100%', objectFit: 'cover', maxWidth: 'none' }} />
                </div>
                <div style={{
                  position: 'absolute', top: 0, left: `${sliderPos}%`, width: 3, height: '100%',
                  background: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.5)', transform: 'translateX(-50%)',
                }} />
                <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>&#xc6d0;&#xbcf8;</div>
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(27,94,32,0.8)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>AI &#xbcf4;&#xc815;</div>
              </div>
            </div>

            {/* Analysis Results */}
            {analysis?.parameters && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginTop: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <h3 style={{ color: '#1B5E20', marginTop: 0 }}>&#x1f4ca; AI &#xbd84;&#xc11d; &#xacb0;&#xacfc;</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {Object.entries(analysis.parameters).map(([key, val]) => (
                    <div key={key} style={{ background: '#f8fdf8', padding: '10px 14px', borderRadius: 8, border: '1px solid #E8F5E9' }}>
                      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{key.replace(/_/g, ' ')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#ddd', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.abs(Number(val)) * 100}%`, height: '100%', background: '#388E3C', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1B5E20' }}>{Number(val).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mosaic Info */}
            {mosaicAreas.length > 0 && (
              <div style={{ background: '#FFF3E0', borderRadius: 16, padding: 24, marginTop: 16, border: '1px solid #FFE0B2' }}>
                <h3 style={{ color: '#E65100', marginTop: 0 }}>&#x1f512; &#xac1c;&#xc778;&#xc815;&#xbcf4; &#xbaa8;&#xc790;&#xc774;&#xd06c; &#xcc98;&#xb9ac;</h3>
                <p style={{ fontSize: 14 }}>{mosaicAreas.length}&#xac1c; &#xc601;&#xc5ed;&#xc774; &#xc790;&#xb3d9; &#xbaa8;&#xc790;&#xc774;&#xd06c; &#xcc98;&#xb9ac;&#xb418;&#xc5c8;&#xc2b5;&#xb2c8;&#xb2e4;.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {mosaicAreas.map((area, i) => (
                    <span key={i} style={{ background: '#FFE0B2', padding: '4px 10px', borderRadius: 12, fontSize: 12 }}>
                      {area.type === 'face' ? '\uD83D\uDC64 &#xC5BC;&#xAD74;' : area.type === 'plate' ? '\uD83D\uDE97 &#xBC88;&#xD638;&#xD310;' : area.type === 'document' ? '\uD83D\uDCC4 &#xBB38;&#xC11C;' : '\uD83D\uDCDD &#xD14D;&#xC2A4;&#xD2B8;'}
                      ({area.confidence.toFixed(0)}%)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
              <button onClick={downloadImage} style={{
                background: 'linear-gradient(135deg, #1B5E20, #388E3C)', color: '#fff', border: 'none',
                padding: '14px 32px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}>
                &#x2B07;&#xFE0F; WebP &#xB2E4;&#xC6B4;&#xB85C;&#xB4DC; (93%)
              </button>
              <button onClick={() => { setOriginalImage(null); setEnhancedImage(null); setAnalysis(null); setMosaicAreas([]); }} style={{
                background: '#fff', color: '#1B5E20', border: '2px solid #1B5E20',
                padding: '14px 32px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}>
                &#x1F504; &#xC0C8; &#xC0AC;&#xC9C4;
              </button>
            </div>
          </div>
        )}

        {/* Original image + Start button */}
        {originalImage && !enhancedImage && !isAnalyzing && !isEnhancing && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <img src={originalImage} alt="preview" style={{ width: '100%', maxHeight: 500, objectFit: 'contain', borderRadius: 8 }} />
              <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
                <button onClick={startEnhancement} style={{
                  background: 'linear-gradient(135deg, #1B5E20, #2E7D32)', color: '#fff', border: 'none',
                  padding: '16px 40px', borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(27,94,32,0.3)',
                }}>
                  &#x2728; AI &#xC790;&#xB3D9; &#xBCF4;&#xC815; &#xC2DC;&#xC791;
                </button>
                <button onClick={() => setOriginalImage(null)} style={{
                  background: '#f5f5f5', color: '#666', border: 'none',
                  padding: '16px 24px', borderRadius: 12, fontSize: 14, cursor: 'pointer',
                }}>
                  &#xCDE8;&#xC18C;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#FFEBEE', borderRadius: 12, padding: 16, marginTop: 16, border: '1px solid #FFCDD2', color: '#C62828' }}>
            <strong>&#xC624;&#xB958;:</strong> {error}
          </div>
        )}
      </div>

      {/* Hidden Canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
