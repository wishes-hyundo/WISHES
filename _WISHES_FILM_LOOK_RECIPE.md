# 위시스 필름 룩 영구 명세 (Fujifilm Classic Negative Recipe)

> **사장님 명령 2026-04-28**: 위시스가 처리하는 모든 사진/영상은 이 레시피를 자동 적용한다.
> 절대 변경 X. mobile-photo 업로드/편집/비디오 트랜스코드 모두 동일.

---

## 🎞️ 레시피 (Fujifilm Classic Negative)

| 항목 | 값 | 의도 |
|---|---|---|
| **Film Simulation** | Classic Negative | 필름 베이스 톤 (cyan-magenta cross-process) |
| **Grain Effect** | Strong / Large | 거친 필름 입자감 (디지털 클린 룩 X) |
| **Colour Chrome FX** | Strong | 채도 영역별 톤 강조 (skin tone deeper) |
| **Colour Chrome FX Blue** | Strong | 청색 영역 더욱 깊고 풍부하게 |
| **White Balance** | Auto + 옵션 1: (+3 Red, -5 Blue) / 옵션 2: (0 Red, -2 Blue) | 따뜻하고 약간 청색 빠진 톤 |
| **Dynamic Range** | DR400 | 하이라이트 보호 + 섀도우 디테일 |
| **Colour** | +4 | 채도 강화 |
| **Highlight** | -2 | 하이라이트 부드럽게 |
| **Shadow** | -2 | 섀도우 부드럽게 (low-contrast 필름 룩) |
| **Sharpness** | +2 | 적당한 샤프닝 |
| **Noise Reduction** | -4 | NR 최소 (필름 그레인 보존) |
| **Clarity** | -2 | 미세 대비 약하게 (부드러운 톤) |

---

## 🔧 기술 구현 매핑

### 사진 (WebGL2 fragment shader, 60fps)

```glsl
// 1. WB shift (선택: opt1 +3R-5B, opt2 0R-2B)
vec3 wb = applyWhiteBalance(srcRGB, +3.0, -5.0);

// 2. Tone curve (Classic Negative LUT 근사)
vec3 base = applyClassicNegativeCurve(wb);

// 3. Highlight -2 + Shadow -2 (luminance-based tone curve)
vec3 hs = applyToneCurve(base, highlight=-2.0, shadow=-2.0);

// 4. Dynamic Range 400 (highlight protection)
vec3 dr = applyDynamicRange(hs, 400);

// 5. Colour +4 (saturation boost)
vec3 sat = adjustSaturation(dr, +4.0);

// 6. Colour Chrome FX (saturation-region-based push)
vec3 cc = applyColourChromeFX(sat, strength=1.0);

// 7. Colour Chrome FX Blue (blue-region push)
vec3 ccb = applyColourChromeFXBlue(cc, strength=1.0);

// 8. Clarity -2 (local contrast / unsharp mask negative)
vec3 cl = applyClarity(ccb, -2.0);

// 9. Sharpness +2 (luminance unsharp mask)
vec3 sh = applySharpness(cl, +2.0);

// 10. Grain Strong/Large (Perlin noise overlay)
vec3 grain = applyFilmGrain(sh, strength=1.0, size=2.0);

// 11. NR -4 (skip — preserve grain detail)
// no-op

gl_FragColor = vec4(grain, 1.0);
```

### 비디오 (FFmpeg.wasm filter chain)

```bash
-vf "
  curves=psfile='classic-negative.acv',
  eq=brightness=-0.04:contrast=0.94:saturation=1.16:gamma=0.96,
  colorchannelmixer=
    rr=1.06:rg=-0.02:rb=-0.02:
    gr=0.00:gg=1.02:gb=-0.02:
    br=-0.05:bg=0.00:bb=0.95,
  unsharp=5:5:0.4:5:5:0.0,
  noise=alls=8:allf=t+u
"
```

### 핵심 알고리즘 (의사 코드)

#### Colour Chrome FX (saturation-region boost)
```js
// HSV로 변환 → saturation > 0.5 영역만 추가 부스트
hsv.s = saturation > 0.5
  ? min(1.0, saturation * 1.15)
  : saturation;
```

#### Colour Chrome FX Blue (blue-channel deepening)
```js
// HSV hue ∈ [200°, 260°] (blue area) → saturation +20%, value -8%
if (hue >= 200 && hue <= 260) {
  hsv.s = min(1.0, hsv.s * 1.20);
  hsv.v = hsv.v * 0.92;
}
```

#### Classic Negative LUT (tone curve)
```js
// R: slight S-curve, +5 shadow lift
// G: linear with -3 mid
// B: stronger lift in shadow, slight roll-off in highlight
```

---

## 📋 적용 위치 (모든 위시스 사진/영상)

1. `/mobile-photo.html` — 업로드/편집 시 자동 적용
2. `/api/admin/extract-from-photo` — Gemini Vision OCR 후 사진 저장 시 적용
3. `/api/listings/[id]/images` POST — 모든 신규 위시스 사진
4. `/api/listings/[id]/videos` POST — 모든 신규 위시스 영상
5. `/api/cron/enrich-vision` — 사진 enrich 후 처리

**예외 (적용 X)**:
- `crawled` source 사진 — 절대 위시스 룩 적용 X (저작권 + 위시스 사진 차별화)
- 사장님이 명시적으로 "원본 보존" 선택한 경우

---

## 🎯 사장님 미세 조정 옵션

### Preset 모드
- **Preset A**: 위 레시피 그대로 (기본)
- **Preset B**: WB (0R, -2B) — 더 중성적인 옵션 2
- **Preset C**: Grain Off — 인테리어 사진 (선택)
- **Custom**: 사장님이 슬라이더로 조정

### 모바일 UI
- 업로드 후 미리보기 자동
- 좌우 스와이프 → 원본/필름 룩 비교
- 슬라이더로 12개 파라미터 미세 조정
- 저장 시 위시스 룩 + 워터마크 + EXIF 제거 + 다중 해상도 일괄

---

## 🔐 영구 보장

- 이 파일은 절대 삭제 X
- 셰이더 코드 변경 시 사장님 명시적 승인 필요
- 매 commit 후 시각적 회귀 테스트 (golden image diff)
- A/B 비교 (라이브 vs 로컬) Storybook visual snapshot

---

작성: 2026-04-28 사장님 명령 — Classic Negative 레시피 정확 수치 영구 기억
적용: 모든 위시스 사진/영상 자동
의존성: 무료 lib만 (WebGL2/WebGPU + FFmpeg.wasm)
