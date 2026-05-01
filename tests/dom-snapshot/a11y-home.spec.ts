// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-M-1 (2026-04-30): axe-core 접근성 회귀 안전망 — 랜딩 (/)
//   WCAG 2.2 AAA 목표 (CLAUDE.md §3 #4). 자동 검증 = 회귀 catch.
//   serious/critical violations 0 강제 (warn 수준은 PR-M-2 RFC 후 조정).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('a11y-home (axe-core)', () => {
  test('/ — WCAG 2.0 A/AA — serious/critical violations 0', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 25_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // serious + critical 만 strict (minor / moderate 는 PR-M-2 에서 점진 fix)
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
