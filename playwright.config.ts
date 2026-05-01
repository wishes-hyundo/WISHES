// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 6 — Playwright DOM Snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 동작:
//   1. webServer 가 'npm run start' 자동 실행 (next build 미리 필요)
//   2. tests/dom-snapshot/*.spec.ts 4 페이지 (/, /map, /listings/[id], /about) 렌더
//   3. 핵심 selector 텍스트 / HTML 구조 baseline 박제
//
// 실행:
//   npm run build                   # next build (필수 선행)
//   npm run dom-snapshot:update     # 첫 박제 (snapshot 파일 생성)
//   npm run dom-snapshot            # 검증 (snapshot diff)
//
// CI (단계 7):
//   - npm install
//   - npx playwright install --with-deps chromium
//   - npm run build
//   - npm run dom-snapshot
//
// 헌법 §125.1 단계 6 + §72.1 + §96 / §101

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/dom-snapshot',
  testMatch: '**/*.spec.ts',

  // 결정적 snapshot 을 위해 순차 실행
  fullyParallel: false,
  workers: 1,

  // CI 안정성
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,

  // 리포트
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',

  // 공통 use
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // snapshot 저장 위치
  snapshotPathTemplate:
    '{testDir}/__html-snapshots__/{testFilePath}/{arg}{ext}',

  // 단계 6 chromium + PR-N-3 mobile + PR-M-1 (2026-04-30) a11y axe-core.
  //   chromium  — DOM snapshot (mobile-/a11y- 제외)
  //   mobile    — iPhone 13 emulation (mobile-*.spec.ts)
  //   a11y      — desktop axe-core 검증 (a11y-*.spec.ts)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /^(?!.*(?:mobile-|a11y-)).*\.spec\.ts$/,
    },
    {
      name: 'mobile-iphone13',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile-.*\.spec\.ts$/,
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /a11y-.*\.spec\.ts$/,
    },
  ],

  // 자동 next start 서버 (이미 떠 있으면 재사용)
  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000, // next start 부팅 최대 2 분
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // snapshot 비교 임계치 (라이브 데이터 변동 흡수)
  expect: {
    timeout: 10_000,
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02, // 2% 픽셀 차이 허용
    },
  },

  // 단계 6 sanity — 페이지 당 30 초 (수동 매물 fetch 흡수)
  timeout: 30_000,
});
