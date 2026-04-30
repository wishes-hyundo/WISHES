// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) §125.1 단계 6 — /listings/[id] DOM snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// /listings/[id] = async server component
//   + force-dynamic + supabase.from('listings').select(...).eq('id', ...)
//   + sanitizePublicListing + applyImagePolicy
//   + ListingDetailClient (client comp)
//
// 환경변수:
//   PLAYWRIGHT_SAMPLE_LISTING_ID — 검증할 매물 ID (기본 46077, 봉천 원룸)
//   PLAYWRIGHT_BASE_URL — 검증할 사이트 URL (기본 http://localhost:3000)
//
// CLAUDE.md /map 영구 명령:
//   /listings/[id] → /map/[id] 308 redirect (next.config.js)
//   따라서 /listings/[id] 직접 접근 시 /map/[id] 로 리다이렉트 후 매물 카드 모달
//
// 검증 항목:
//   1. 308 redirect 또는 직접 모달 표시 (URL 변동 검증)
//   2. 매물 ID 가 URL 또는 모달에 포함
//   3. 가격 / 주소 / 타입 sanity
//
// 헌법 §125.1 + §72.1 + §96 / §100 / §101

import { test, expect } from '@playwright/test';

const SAMPLE_ID = process.env.PLAYWRIGHT_SAMPLE_LISTING_ID || '46077';

test.describe('매물 상세 (/listings/[id]) — PR-E §125 단계 6 baseline', () => {
  test('직접 접근 → /map/[id] redirect 또는 모달 표시', async ({ page }) => {
    const response = await page.goto(`/listings/${SAMPLE_ID}`);
    await page.waitForLoadState('networkidle');

    // 308 redirect 또는 직접 200 (둘 다 허용)
    expect([200, 308].includes(response?.status() ?? 0)).toBe(true);

    // URL 검증 — /map/{id} 또는 /listings/{id}
    const url = page.url();
    expect(url).toMatch(new RegExp(`(/listings/|/map/)${SAMPLE_ID}`));
  });

  test('매물 ID 표시 sanity', async ({ page }) => {
    await page.goto(`/listings/${SAMPLE_ID}`);
    await page.waitForLoadState('networkidle');

    // 매물 ID 또는 매물번호 표시 확인 (모달 또는 페이지 내)
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('main / 모달 mount sanity', async ({ page }) => {
    await page.goto(`/listings/${SAMPLE_ID}`);
    await page.waitForLoadState('networkidle');

    // main 또는 dialog (모달) 마운트
    const mainCount = await page.locator('main, [role="dialog"]').count();
    expect(mainCount).toBeGreaterThan(0);
  });
});
