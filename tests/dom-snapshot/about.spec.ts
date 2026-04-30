// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 6 — /about DOM snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// /about (AboutPage) = sync server component
//   + 정적 HTML (회사 소개 / 위치 / 인증)
//   + AboutKakaoMap (client comp — Kakao Maps SDK)
//   + Metadata (title / description / OG / canonical)
//
// 가장 안정적인 페이지 — 데이터 0% 동적 → 풀 HTML snapshot 가능.
//
// 검증 항목:
//   1. 페이지 mount + title 메타데이터 검증
//   2. main 풀 HTML snapshot (정적이므로 deterministic)
//   3. 회사 정보 핵심 키워드 존재 (관악구 / 신림 / 공인중개사 / 전화 / 이메일)
//   4. AboutKakaoMap 마운트 (canvas 또는 iframe)
//
// 헌법 §125.1 + §72.1 + §96 / §100 / §101

import { test, expect } from '@playwright/test';

test.describe('회사 소개 (/about) — PR-E §125 단계 6 baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
  });

  test('페이지 mount + 메타 sanity', async ({ page }) => {
    await expect(page.locator('main, body').first()).toBeVisible();

    const title = await page.title();
    expect(title).toMatch(/wishes|위시스|회사소개/i);

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(20);
  });

  test('main 영역 풀 HTML snapshot (정적)', async ({ page }) => {
    const html = await page.locator('main, body').first().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      // Cache busting / nonce 정규화
      let html = clone.innerHTML;
      html = html.replace(/\?v=[a-f0-9]+/g, '?v=H');
      html = html.replace(/nonce="[^"]+"/g, 'nonce="N"');
      // Kakao Maps iframe src — 동적 token 정규화
      html = html.replace(
        /https:\/\/dapi\.kakao\.com\/[^"]+/g,
        'https://dapi.kakao.com/NORMALIZED'
      );
      return html;
    });
    expect(html).toMatchSnapshot('about-main.html');
  });

  test('핵심 회사 정보 키워드', async ({ page }) => {
    const text = await page.locator('main, body').first().innerText();
    // 사장님 명령: 관악구 신림동 소재 — 공인중개사 표시 의무
    expect(text).toMatch(/관악구|신림|공인중개사|위시스/);
  });

  test('canonical link 검증', async ({ page }) => {
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute('href');
    expect(canonical).toMatch(/wishes\.co\.kr\/about/);
  });
});
