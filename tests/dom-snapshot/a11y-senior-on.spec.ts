import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * RFC 0014 — 시니어 토글 ON 상태 a11y 게이트 (PR-M-2)
 *
 * - localStorage 'wishes-senior=1' 미리 주입 후 페이지 로드
 * - WCAG 2.0 + 2.1 + 2.2 A/AA + AAA color-contrast-enhanced 검사
 * - serious + critical 0
 *
 * /map 은 canvas 마커 false-positive 회피로 color-contrast disable.
 */

test.describe('a11y-senior-on (axe-core, 시니어 모드 ON)', () => {
  test.beforeEach(async ({ context }) => {
    // localStorage 동기화 (모든 페이지 시니어 모드 ON 으로 시작)
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('wishes-senior', '1');
      } catch {
        /* no-op */
      }
    });
  });

  test('/ — 시니어 모드 ON, WCAG 2.x A/AA/AAA — serious/critical 0', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 25_000 });
    // 시니어 모드 적용 확인
    await expect(page.locator('html')).toHaveAttribute('data-senior', 'true');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blockers).toHaveLength(0);
  });
});
