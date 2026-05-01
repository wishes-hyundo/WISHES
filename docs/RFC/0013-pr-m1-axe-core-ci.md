# RFC 0013 — PR-M-1: axe-core CI (접근성 회귀 안전망)

> **상태**: Draft → 라이브 적용
> **작성**: 2026-05-01
> **라벨**: `[UI:0]` `[CI-only]`
> **선행**: PR-N-3 (#31) — Playwright mobile CI 검증
> **참조**: CLAUDE.md `#3 UI/UX 기준 — 접근성 WCAG 2.2 AAA` / 헌법 §54

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — 접근성은 헌법 명시 요구
- [x] 회귀 0 — CI-only, runtime 영향 0
- [x] 무료/OSS — @axe-core/playwright (MPL-2.0)
- [x] 만든 것 보존 — 기존 dom-snapshot 4 spec, mobile 2 spec 그대로
- [x] UI 헌법 §54 — 픽셀 변경 0 (테스트 추가만)
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 통과 (CI 게이트 추가로 강화)
- [x] 0 회귀 머지
- [x] 세 페르소나 — a11y 위반 사전 차단으로 시니어/고령 사용자 보호
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. 목적

**접근성 회귀 안전망**. 헌법 §3 "접근성 WCAG 2.2 AAA" 명령에도 불구하고 자동 검증 게이트 부재로 최근 머지 회귀 위험 노출. axe-core 를 CI 에 추가하여 serious/critical 위반을 머지 전 차단한다.

---

## 2. Scope (3 파일)

### 2.1 `package.json` — devDependencies 1줄 추가
```json
"@axe-core/playwright": "^4.10.2"
```
- license: MPL-2.0 (OSS)
- runtime 미포함 (devDependency only)

### 2.2 `playwright.config.ts` — projects 3-way split
```ts
projects: [
  { name: 'chromium',         testMatch: /^(?!.*(?:mobile-|a11y-)).*\.spec\.ts$/ },
  { name: 'mobile-iphone13',  testMatch: /mobile-.*\.spec\.ts$/ },
  { name: 'a11y',             testMatch: /a11y-.*\.spec\.ts$/ },  // 신규
]
```

### 2.3 신규 spec 2건 (tests/dom-snapshot/)
- `a11y-home.spec.ts` — `/` WCAG 2.0 A/AA + WCAG 2.1 A/AA 위반 0
- `a11y-map.spec.ts` — `/map` 동일 정책, `color-contrast` 만 disable (canvas 마커 false-positive 회피)

각 spec 의 게이트:
```ts
const blockers = results.violations.filter(
  (v) => v.impact === 'serious' || v.impact === 'critical',
);
expect(blockers).toHaveLength(0);
```

---

## 3. CI 영향

### 3.1 GitHub Actions (자동 실행)
기존 Playwright workflow 가 모든 project 를 자동 실행하므로 **신규 workflow 파일 불필요**. `a11y` project 가 자동 추가됨.

### 3.2 비용
- GitHub Actions free tier 안 (월 2,000 분)
- 2 spec × ~10초 = 추가 ~20초/run

### 3.3 게이트 등급
- `serious` + `critical` 만 차단 (false-positive 최소화)
- `moderate` / `minor` 는 리포트만 (PR-M-2 시니어 토글에서 단계 강화 예정)

---

## 4. WCAG 정책

태그 명세:
- `wcag2a` / `wcag2aa` — WCAG 2.0 Level A/AA
- `wcag21a` / `wcag21aa` — WCAG 2.1 Level A/AA

WCAG 2.2 AAA 는 PR-M-2 시니어 토글에서 점진 도입 (현 단계는 baseline).

---

## 5. 보존 (헌법 §101)

- 기존 dom-snapshot 4 spec (home/about/listing-detail/map) — 변경 X
- mobile 2 spec (mobile-home/mobile-map) — 변경 X
- chromium project testMatch 만 negative-lookahead 확장: `(?!.*(?:mobile-|a11y-))`

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| `/map` canvas 마커 색대비 false-positive | `disableRules(['color-contrast'])` |
| 신규 위반으로 CI red → 머지 차단 | `serious`+`critical` 만 차단 (moderate 는 통과) |
| Playwright a11y 프로젝트가 chromium 과 중복 실행 | testMatch regex 분리로 격리 |
| @axe-core/playwright 업데이트 시 회귀 | `^4.10.2` semver minor pin |

---

## 7. UI 영향 = 0

- runtime 코드 미수정 (3 파일 모두 build/test 영역)
- 사용자 화면 픽셀 변경 0
- production bundle 영향 0

---

## 8. 후속 PR

- **PR-M-2** 시니어 토글 (큰 폰트 / 고대비) — RFC 별도, 사장님 승인 필수
- **PR-M-3** axe-core moderate 등급도 게이트 (3개월 안정 후)
- **PR-M-4** /search vanilla 별도 검증 spec (CLAUDE.md `/search` 보존 정책 영향 0 확인)

---

작성: 2026-05-01 (PR-N 시리즈 직후)
