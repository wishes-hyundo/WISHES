// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-M-1 (2026-04-30): axe-core 접근성 회귀 안전망 — /map
//   사장님 영업 핵심 페이지. 시니어/외국인 사용자 진입 보호.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('a11y-map (axe-core)', () => {
  test('/map — WCAG 2.0 A/AA — serious/critical violations 0', async ({ page }) => {
    await page.goto('/map', { waitUntil: 'networkidle', timeout: 25_000 });

    const results = await new AxeBuilder({ page })
      // 지도 canvas 는 axe 가 부정확 평가 — color-contrast 만 비활성 (canvas 픽셀)
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (blockers.length > 0) {
      console.log('axe blockers:', JSON.stringify(blockers.map((v) => ({
        id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help,
      })), null, 2));
    }

    expect(blockers, `serious/critical a11y 위반 ${blockers.length}건`).toHaveLength(0);
  });
});
