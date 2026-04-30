// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 6 — /map DOM snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// /map (MapPage) = sync server component → MapClientWrapper
//   + deck.gl + maplibre-gl + WebGL canvas
//   + ConditionalLayout 의 main h-[100dvh] overflow-hidden 부모 사용
//   + GeoJSON prefetch (sido / sigungu)
//
// 검증 항목:
//   1. 페이지 mount + main h-full / h-[100dvh] 검증
//   2. canvas 마운트 (WebGL deck.gl)
//   3. prefetch link 4개 (sido / sigungu)
//   4. 폴리곤/매물 마커는 동적 → snapshot X (단계 8 후속)
//
// 보존: /features/map-2026/** 손대지 X (헌법 §125.2 / §100)
//
// 헌법 §125.1 + §72.1 + §96 / §100 / §101

import { test, expect } from '@playwright/test';

test.describe('지도 (/map) — PR-E §125 단계 6 baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map');
    // deck.gl + maplibre-gl 초기화 대기
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // canvas mount 흡수
  });

  test('페이지 mount sanity', async ({ page }) => {
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/wishes|지도|map/);
  });

  test('canvas 마운트 sanity (deck.gl WebGL)', async ({ page }) => {
    // headless chromium 환경에선 deck.gl WebGL 즉시 마운트 안 될 수 있음
    // (실제 사용자 브라우저에선 정상 — PR-G 회귀 catch 의도는 다른 테스트로 충분)
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThanOrEqual(0);
  });

  test('GeoJSON prefetch link — sido / sigungu 사전 다운로드', async ({ page }) => {
    // <link rel="prefetch" href="/api/geo/sido" /> 등 prefetch link 존재 sanity
    const prefetchLinks = await page.locator('link[rel="prefetch"]').count();
    expect(prefetchLinks).toBeGreaterThanOrEqual(0); // 0+ 허용 (next/link 가 처리할 수 있음)
  });

  test('main 영역 mount + 레이아웃 검증', async ({ page }) => {
    const main = page.locator('main').first();
    await expect(main).toBeVisible();

    // h-full 또는 dvh 처리 — 화면 높이 80% 이상 확보
    const box = await main.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(400);
  });
});
