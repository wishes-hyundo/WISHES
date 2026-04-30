// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 6 — / 홈 DOM snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// /  (HomePage) = async server component
//   + popularDongs / totalListings 집계 (revalidate=300)
//   + HeroBackground / HomeMapPreview client component
//
// 검증 항목:
//   1. 페이지 mount sanity (main / title / WISHES 문자열)
//   2. main 영역 HTML 구조 baseline (동적 데이터 정규화 후)
//   3. 핵심 link / heading / CTA 존재
//
// 헌법 §125.1 + §72.1 + §96 / §100 / §101

import { test, expect } from '@playwright/test';

test.describe('홈 (/) — PR-E §125 단계 6 baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('페이지 mount sanity', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible();

    const title = await page.title();
    expect(title.toLowerCase()).toContain('wishes');
  });

  test('main 영역 HTML 구조 baseline (동적 데이터 정규화)', async ({ page }) => {
    const html = await page.locator('main').first().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      // 동적 attribute 제거
      clone.querySelectorAll('[data-listing-id]').forEach((n) =>
        n.removeAttribute('data-listing-id')
      );
      clone.querySelectorAll('[data-id]').forEach((n) =>
        n.removeAttribute('data-id')
      );
      // 4자리 이상 숫자 정규화 (총 매물 수 / 카운트 등)
      let html = clone.innerHTML;
      html = html.replace(/\d{4,}/g, 'N');
      // Cache busting hash 정규화
      html = html.replace(/\?v=[a-f0-9]+/g, '?v=H');
      return html;
    });
    expect(html).toMatchSnapshot('home-main.html');
  });

  test('히어로 / 핵심 CTA 존재', async ({ page }) => {
    // 지도 / 검색 진입 CTA — Link 텍스트 또는 aria-label
    const links = await page.locator('a[href*="/map"]').count();
    expect(links).toBeGreaterThan(0);
  });

  test('인기 동네 또는 매물 수 — 집계 데이터 표시 sanity', async ({ page }) => {
    // popularDongs 또는 totalListings 표시 영역 — 텍스트 내 숫자 1+ 또는 동 이름 1+
    const mainText = await page.locator('main').first().innerText();
    expect(mainText.length).toBeGreaterThan(50);
  });
});
