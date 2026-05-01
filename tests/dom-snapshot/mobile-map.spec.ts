// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-N-3 (2026-04-30): 모바일 viewport 회귀 안전망 — /map
//   CLAUDE.md /map 영구 4가지 요구사항 보호 (모바일 트래픽 70%).
//   iPhone 13 emulation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { test, expect } from '@playwright/test';

test.describe('mobile-map (iPhone 13)', () => {
  test('/map 모바일 렌더 sanity (canvas / SVG 존재)', async ({ page }) => {
    await page.goto('/map', { waitUntil: 'networkidle', timeout: 25_000 });

    const viewport = page.viewportSize();
    expect(viewport!.width).toBeLessThanOrEqual(480);

    // canvas 또는 svg 존재 — 지도 자체는 client 라 첫 렌더 sanity 만
    const hasCanvas = (await page.locator('canvas, svg').count()) > 0;
    expect(hasCanvas).toBe(true);

    // body 너비 viewport 안 (가로 스크롤 X)
    const bodyBox = await page.locator('body').boundingBox();
    expect(bodyBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  });

  test('/map?listing=ID URL 라우팅 (CLAUDE.md 4가지 영구 #3)', async ({ page }) => {
    // 잘 알려진 매물 ID (PR-A baseline.json g036 sample_ids[0] = 45899)
    const response = await page.goto('/map?listing=45899', { waitUntil: 'domcontentloaded', timeout: 25_000 });

    // 200 OK (404 X)
    expect(response?.status()).toBeLessThan(400);

    // 매물별 SSR metadata 확인 (PR-D2 v2 #26)
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });
});
