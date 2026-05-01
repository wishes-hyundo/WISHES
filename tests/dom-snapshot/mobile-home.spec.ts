// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-N-3 (2026-04-30): 모바일 viewport 회귀 안전망 — 랜딩 (/)
//   사용자 트래픽 70% 경로. iPhone 13 emulation.
//   regression-gate.yml dom-snapshot gate 자동 실행.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { test, expect } from '@playwright/test';

test.describe('mobile-home (iPhone 13)', () => {
  test('랜딩 페이지 모바일 렌더 sanity', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 25_000 });

    // 모바일 viewport 검증 — 너비 ≤ 480 (iPhone 13 = 390)
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBeLessThanOrEqual(480);

    // 핵심 element 존재 (모바일에서도 노출)
    await expect(page).toHaveTitle(/WISHES|위시스/);

    // body 가 viewport 너비를 넘지 않음 (가로 스크롤 X — 모바일 UX 핵심)
    const body = page.locator('body');
    const bodyBox = await body.boundingBox();
    expect(bodyBox).not.toBeNull();
    expect(bodyBox!.width).toBeLessThanOrEqual(viewport!.width + 1); // 1px tolerance
  });

  test('manifest.json 링크 + 모바일 viewport meta', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // PWA manifest 링크 검증
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /manifest\.json/);

    // viewport meta — 모바일 핵심
    const viewportMeta = page.locator('meta[name="viewport"]');
    const content = await viewportMeta.getAttribute('content');
    expect(content).toBeTruthy();
    expect(content).toContain('width=device-width');
  });
});
