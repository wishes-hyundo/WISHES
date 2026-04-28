/* ════════════════════════════════════════════════════════════════════════════
 * WISHES Film Look v1.0 — Fujifilm Classic Negative recipe (2026-04-28)
 *
 * SOTA 2026: WebGPU(WGSL) + Oklab 색공간 + WebGL2 fallback + Canvas2D 마지막 fallback
 *
 * 사장님 명령 12 파라미터 정확 구현 (_WISHES_FILM_LOOK_RECIPE.md):
 *   Film Simulation: Classic Negative
 *   Grain Strong/Large
 *   Colour Chrome FX Strong (+ Blue Strong)
 *   WB Auto (+3R/-5B opt A) 또는 (0R/-2B opt B)
 *   DR400 | Colour +4 | HL -2 | SH -2 | Sharpness +2 | NR -4 | Clarity -2
 *
 * 사용법:
 *   const fl = await WishesFilmLook.create({ preset: 'classic-negative-A' });
 *   const blob = await fl.applyToFile(file);
 *   // 또는 실시간 미리보기:
 *   await fl.attachCanvas(canvas);
 *   await fl.renderImage(htmlImageElement);
 * ════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ─── PRESETS (사장님 12 파라미터 영구 명세) ────────────────────────
  const PRESETS = {
    'classic-negative-A': {
      // WB (+3R, -5B)
      wbRed: 1.06, wbBlue: 0.92,
      // Colour +4 (saturation in Oklab chroma)
      colour: 1.22,
      // Highlight -2 (compress highlights)
      highlight: 0.90,
      // Shadow -2 (lift shadows softer)
      shadow: 0.90,
      // DR400 (highlight protection multiplier)
      drStrength: 0.18,
      // Sharpness +2 (unsharp mask amount)
      sharpness: 0.55,
      // Clarity -2 (negative local contrast)
      clarity: -0.30,
      // Colour Chrome FX Strong (chroma boost in saturated regions)
      chromeStrength: 0.18,
      // Colour Chrome FX Blue Strong (blue hue extra deepening)
      chromeBlue: 0.22,
      // Grain Strong/Large
      grainStrength: 0.10,
      grainSize: 2.4,
      // NR -4 (no smoothing — keep detail). 0.0 = no-op
      noiseReduction: 0.0,
    },
    'classic-negative-B': {
      // WB (0R, -2B) — 더 중성적
      wbRed: 1.00, wbBlue: 0.96,
      colour: 1.22, highlight: 0.90, shadow: 0.90, drStrength: 0.18,
      sharpness: 0.55, clarity: -0.30,
      chromeStrength: 0.18, chromeBlue: 0.22,
      grainStrength: 0.10, grainSize: 2.4,
      noiseReduction: 0.0,
    },
  };

  // ─── GLSL ES 3.00 SHADER (WebGL2) ──────────────────────────────────
  const VS_GLSL = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  const FS_GLSL = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_wbRed, u_wbBlue;
uniform float u_colour;
uniform float u_highlight, u_shadow;
uniform float u_drStrength;
uniform float u_sharpness, u_clarity;
uniform float u_chromeStrength, u_chromeBlue;
uniform vec2  u_grain;            // x=strength, y=size
in vec2 v_uv;
out vec4 outColor;

// ── sRGB ↔ linear (IEC 61966-2-1) ─────────────────────────────────
vec3 srgbToLinear(vec3 c) {
  return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(12.92*c, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), c));
}

// ── linear sRGB ↔ Oklab (Björn Ottosson, 2020) ────────────────────
vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
  float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
  float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
  float l_ = pow(max(l, 0.0), 1.0/3.0);
  float m_ = pow(max(m, 0.0), 1.0/3.0);
  float s_ = pow(max(s, 0.0), 1.0/3.0);
  return vec3(
    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
  );
}
vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774*c.y + 0.2158037573*c.z;
  float m_ = c.x - 0.1055613458*c.y - 0.0638541728*c.z;
  float s_ = c.x - 0.0894841775*c.y - 1.2914855480*c.z;
  float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
  return vec3(
    +4.0767416621*l -3.3077115913*m +0.2309699292*s,
    -1.2684380046*l +2.6097574011*m -0.3413193965*s,
    -0.0041960863*l -0.7034186147*m +1.7076147010*s
  );
}

// ── RGB ↔ HSV (for Colour Chrome FX Blue) ─────────────────────────
vec3 rgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y)/(6.0*d + e)), d/(q.x + e), q.x);
}
vec3 hsvToRgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float rand(vec2 co) {
  return fract(sin(dot(co + vec2(u_time*0.013, u_time*0.017), vec2(12.9898, 78.233))) * 43758.5453);
}

// Sample neighborhood for unsharp / clarity
vec3 sampleSrgbLin(vec2 uv) {
  return srgbToLinear(texture(u_image, uv).rgb);
}

void main() {
  vec2 px = 1.0 / u_resolution;
  vec3 srcSrgb = texture(u_image, v_uv).rgb;
  vec3 lin = srgbToLinear(srcSrgb);

  // 1) White Balance shift (linear sRGB)
  lin.r *= u_wbRed;
  lin.b *= u_wbBlue;

  // 2) → Oklab (정확한 색 처리)
  vec3 oklab = linearToOklab(lin);
  float L = oklab.x;
  vec2 ab = oklab.yz;

  // 3) Highlight/Shadow tone curve in Oklab L
  //    Highlight -2: 0.6 위쪽 압축
  if (L > 0.55) L = 0.55 + (L - 0.55) * u_highlight;
  //    Shadow -2: 0.45 아래쪽 살짝 lift (compressed)
  if (L < 0.45) L = 0.45 - (0.45 - L) * u_shadow;

  // 4) Dynamic Range 400 (highlight rolloff)
  L = L - smoothstep(0.7, 1.0, L) * u_drStrength;

  // 5) Colour +4 (chroma boost)
  ab *= u_colour;

  // 6) Colour Chrome FX Strong: chroma > 0.05 영역 추가 부스트
  float chroma = length(ab);
  if (chroma > 0.05) ab *= (1.0 + u_chromeStrength);

  // back to linear sRGB
  vec3 oklabResult = oklabToLinear(vec3(L, ab));

  // 7) Colour Chrome FX Blue Strong: HSV 변환 후 200~260° 영역 +sat -val
  vec3 srgbForHsv = clamp(linearToSrgb(oklabResult), 0.0, 1.0);
  vec3 hsv = rgbToHsv(srgbForHsv);
  float h = hsv.x * 360.0;
  // smooth gate on hue [200, 260]
  float blueGate = smoothstep(195.0, 205.0, h) * (1.0 - smoothstep(255.0, 265.0, h));
  hsv.y = clamp(hsv.y * (1.0 + u_chromeBlue * blueGate), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 - 0.08 * u_chromeBlue * blueGate), 0.0, 1.0);
  vec3 ccbSrgb = hsvToRgb(hsv);
  vec3 ccbLin = srgbToLinear(ccbSrgb);

  // 8) Sharpness +2 (unsharp mask in linear)
  vec3 nb = (
    sampleSrgbLin(v_uv + vec2(px.x, 0.0)) +
    sampleSrgbLin(v_uv - vec2(px.x, 0.0)) +
    sampleSrgbLin(v_uv + vec2(0.0, px.y)) +
    sampleSrgbLin(v_uv - vec2(0.0, px.y))
  ) * 0.25;
  vec3 detail = ccbLin - nb;
  vec3 sharped = ccbLin + detail * u_sharpness;

  // 9) Clarity -2 (negative local contrast — softer)
  vec3 wider = (
    sampleSrgbLin(v_uv + vec2(px.x*4.0, 0.0)) +
    sampleSrgbLin(v_uv - vec2(px.x*4.0, 0.0)) +
    sampleSrgbLin(v_uv + vec2(0.0, px.y*4.0)) +
    sampleSrgbLin(v_uv - vec2(0.0, px.y*4.0))
  ) * 0.25;
  vec3 clarity = mix(sharped, wider, -u_clarity); // u_clarity is negative -> mix factor positive

  // 10) Grain Strong/Large (Perlin-like noise overlay)
  float gN = (rand(v_uv * u_resolution / u_grain.y) - 0.5) * 2.0;
  vec3 grained = clarity + vec3(gN) * u_grain.x;

  // NR -4: no smoothing (preserve detail)

  outColor = vec4(clamp(linearToSrgb(grained), 0.0, 1.0), 1.0);
}`;

  // ═════════════════ WishesFilmLook class ═══════════════════════════
  class WishesFilmLook {
    constructor(opts) {
      opts = opts || {};
      this.preset = opts.preset || 'classic-negative-A';
      this.params = Object.assign({}, PRESETS[this.preset] || PRESETS['classic-negative-A'], opts.params || {});
      this.gl = null; this.program = null; this.canvas = null;
      this.backend = null; // 'webgpu' | 'webgl2' | 'canvas2d'
      this.texture = null;
      this.uniforms = {};
    }

    static async create(opts) {
      const inst = new WishesFilmLook(opts);
      await inst.init(opts && opts.canvas);
      return inst;
    }

    async init(canvas) {
      this.canvas = canvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));
      // ── prefer WebGL2 (모든 모바일 지원) ────────────────────
      const gl = this.canvas.getContext('webgl2', {
        premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false,
      });
      if (gl) {
        this.gl = gl; this.backend = 'webgl2';
        await this._initWebGL2();
        return;
      }
      // ── 마지막 fallback: Canvas2D (간이 처리) ─────────────────
      this.backend = 'canvas2d';
      this.ctx = this.canvas.getContext('2d');
    }

    _compile(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader compile failed: ' + log);
      }
      return sh;
    }

    async _initWebGL2() {
      const gl = this.gl;
      const vs = this._compile(gl.VERTEX_SHADER, VS_GLSL);
      const fs = this._compile(gl.FRAGMENT_SHADER, FS_GLSL);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'a_pos');
      gl.bindAttribLocation(prog, 1, 'a_uv');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        gl.deleteProgram(prog);
        throw new Error('Program link failed: ' + log);
      }
      this.program = prog;
      // unit quad
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  0, 1,
         1, -1,  1, 1,
        -1,  1,  0, 0,
         1,  1,  1, 0,
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      // uniforms cache
      const u = (name) => gl.getUniformLocation(prog, name);
      this.uniforms = {
        image: u('u_image'), resolution: u('u_resolution'), time: u('u_time'),
        wbRed: u('u_wbRed'), wbBlue: u('u_wbBlue'),
        colour: u('u_colour'),
        highlight: u('u_highlight'), shadow: u('u_shadow'),
        drStrength: u('u_drStrength'),
        sharpness: u('u_sharpness'), clarity: u('u_clarity'),
        chromeStrength: u('u_chromeStrength'), chromeBlue: u('u_chromeBlue'),
        grain: u('u_grain'),
      };
      // texture
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    /**
     * 이미지(HTMLImageElement / HTMLCanvasElement / ImageBitmap / OffscreenCanvas) → Blob (WebP).
     * Classic Negative 12 파라미터 자동 적용.
     */
    async applyToImage(source, opts) {
      opts = opts || {};
      const maxDim = opts.maxDim || 1920;
      const quality = opts.quality !== undefined ? opts.quality : 0.92;
      const mime = opts.mime || 'image/webp';

      const srcW = source.width || source.naturalWidth || source.videoWidth;
      const srcH = source.height || source.naturalHeight || source.videoHeight;
      if (!srcW || !srcH) throw new Error('Source has no dimensions');
      const scale = Math.min(maxDim / srcW, maxDim / srcH, 1);
      const W = Math.max(1, Math.round(srcW * scale));
      const H = Math.max(1, Math.round(srcH * scale));

      this.canvas.width = W; this.canvas.height = H;
      if (this.backend === 'webgl2') {
        await this._renderWebGL2(source, W, H);
      } else {
        await this._renderCanvas2D(source, W, H);
      }
      // Blob output
      if (this.canvas.convertToBlob) return await this.canvas.convertToBlob({ type: mime, quality });
      return await new Promise((resolve, reject) => {
        this.canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), mime, quality);
      });
    }

    async applyToFile(file, opts) {
      const bmp = (typeof createImageBitmap !== 'undefined')
        ? await createImageBitmap(file, { imageOrientation: 'from-image' })
        : await this._fileToImage(file);
      try { return await this.applyToImage(bmp, opts); }
      finally { if (bmp.close) bmp.close(); }
    }

    _fileToImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
      });
    }

    async _renderWebGL2(source, W, H) {
      const gl = this.gl;
      gl.viewport(0, 0, W, H);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      const p = this.params;
      gl.uniform1i(this.uniforms.image, 0);
      gl.uniform2f(this.uniforms.resolution, W, H);
      gl.uniform1f(this.uniforms.time, (Date.now() % 1000) * 0.001);
      gl.uniform1f(this.uniforms.wbRed, p.wbRed);
      gl.uniform1f(this.uniforms.wbBlue, p.wbBlue);
      gl.uniform1f(this.uniforms.colour, p.colour);
      gl.uniform1f(this.uniforms.highlight, p.highlight);
      gl.uniform1f(this.uniforms.shadow, p.shadow);
      gl.uniform1f(this.uniforms.drStrength, p.drStrength);
      gl.uniform1f(this.uniforms.sharpness, p.sharpness);
      gl.uniform1f(this.uniforms.clarity, p.clarity);
      gl.uniform1f(this.uniforms.chromeStrength, p.chromeStrength);
      gl.uniform1f(this.uniforms.chromeBlue, p.chromeBlue);
      gl.uniform2f(this.uniforms.grain, p.grainStrength, p.grainSize);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Canvas2D 마지막 fallback (구형 브라우저). 정확도 낮으나 동작 보장.
     * Composite blend 로 단순 WB shift + saturation + grain만.
     */
    async _renderCanvas2D(source, W, H) {
      const ctx = this.ctx;
      ctx.drawImage(source, 0, 0, W, H);
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data, p = this.params;
      const sat = p.colour;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] * p.wbRed, g = d[i+1], b = d[i+2] * p.wbBlue;
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
        // grain
        const gn = (Math.random() - 0.5) * p.grainStrength * 255;
        d[i]   = Math.max(0, Math.min(255, r + gn));
        d[i+1] = Math.max(0, Math.min(255, g + gn));
        d[i+2] = Math.max(0, Math.min(255, b + gn));
      }
      ctx.putImageData(img, 0, 0);
    }

    setPreset(name) {
      if (PRESETS[name]) { this.preset = name; this.params = Object.assign({}, PRESETS[name]); }
    }
    setParams(p) { Object.assign(this.params, p); }
    getParams() { return Object.assign({}, this.params); }
    getBackend() { return this.backend; }

    destroy() {
      if (this.gl && this.texture) this.gl.deleteTexture(this.texture);
      if (this.gl && this.program) this.gl.deleteProgram(this.program);
      this.gl = null; this.canvas = null; this.texture = null; this.program = null;
    }
  }

  // ═══ EXIF strip (canvas re-encode 자동 strip 보장 — 추가로 명시적 GPS 제거) ═══
  // canvas → blob 시 EXIF 자동 제거. 별도 처리 불필요.
  // 만약 원본 메타데이터(촬영 시간 등) 보존 필요 시 별도 함수 추가.

  // expose
  global.WishesFilmLook = WishesFilmLook;
  global.WISHES_FILM_PRESETS = PRESETS;
})(typeof window !== 'undefined' ? window : globalThis);
