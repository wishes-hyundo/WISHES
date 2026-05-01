# RFC 0012 — PR-N-3: Playwright 모바일 viewport CI

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-N-1 #30 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-E (#10) Playwright DOM Snapshot 인프라 / PR-N-1 (#30) Web Push
> **참조**: 헌법 §127 #10 / §125.1 단계 6

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — 모바일 트래픽 70% 측정
- [x] 회귀 0 — 신규 mobile spec 만, 기존 desktop spec 그대로
- [x] 무료/OSS — Playwright 무료
- [x] 만든 것 보존 — desktop chromium project 변경 0 (testMatch 분리만)
- [x] UI 헌법 §54 — 픽셀 변경 0 (CI 인프라)
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 모바일 회귀 자동 catch (사용자 70% 보호)
- [x] Phase 1 회귀 안전망 보강
- [x] [UI:0]

---

## 1. Scope

### 1.1 playwright.config.ts mobile project 추가
```diff
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
+     testMatch: /^(?!.*mobile-).*\.spec\.ts$/,  // mobile-*.spec.ts 제외
    },
+   {
+     name: 'mobile-iphone13',
+     use: { ...devices['iPhone 13'] },
+     testMatch: /mobile-.*\.spec\.ts$/,
+   },
  ]
```

자동 실행: desktop 4 spec + mobile 2 spec = 6 test (regression-gate dom-snapshot gate).

### 1.2 mobile-home.spec.ts (신규, 42줄)
- 랜딩 (/) 모바일 렌더 sanity
- viewport 너비 ≤ 480 (iPhone 13 = 390)
- 가로 스크롤 X (body 너비 ≤ viewport)
- manifest.json 링크 검증
- viewport meta `width=device-width` 검증

### 1.3 mobile-map.spec.ts (신규, 38줄)
- /map 모바일 렌더 sanity (canvas / SVG 존재)
- /map?listing=ID URL 라우팅 (CLAUDE.md 4가지 영구 #3)
- 매물별 SSR metadata 보장 (PR-D2 v2 #26)

### 1.4 regression-gate.yml 자동 통합
- 변경 0 (dom-snapshot gate 가 모든 project 자동 실행)
- mobile fail 시 PR 머지 차단 (회귀 안전망)

---

## 2. 영향 (KPI §98)

### KPI #7 (p95 latency < 300ms)
- 모바일 렌더 회귀 자동 catch
- 모바일 가로 스크롤 X 강제 (UX 회귀)

### KPI #1 (회귀 100% PASS)
- 6 게이트 desktop + 2 mobile = 8 test 검증

### 사용자 영향
- 모바일 70% 트래픽 보호
- /map?listing=ID 라우팅 회귀 자동 catch (CLAUDE.md 영구 4가지 #3)
- PR-D2 v2 매물별 SSR metadata 보장

---

## 3. 위험 + 완화

| 위험 | 완화 |
|---|---|
| iPhone 13 emulation 차이 (실기기 X) | sanity 만 검증 (viewport width / 가로 스크롤 / canvas 존재) |
| 매물 45899 deletion (mobile-map.spec.ts:25) | sample_ids 변경 시 baseline 재박제 (PR-E §125 단계 5) |
| dom-snapshot gate 시간 증가 | 기존 4 + 2 = 6 test, 30s/test = 3분 (60분 timeout 안) |

---

## 4. 후속 PR

- **PR-N-4** UI 푸시 동의 프롬프트 (사장님 RFC 승인 필수)
- **PR-N-2** notify-matches Web Push 보강 (VAPID 키 등록)

---

작성: 2026-04-30 (PR-N-1 #30 직후)
