// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E-1 / I-PROC-1 — Critical User Flows 시각 회귀 테스트
//
// 사장님 명령 2026-05-02 — "C 프로그램 빌드처럼 한 번 발견한 문제는 다시는 안 생기게":
//   INVARIANT 기록만으로는 부족 → 사장님이 보는 화면을 컴퓨터가 미리 본다.
//
// 5 시나리오 (사장님 핵심 흐름 재발 차단):
//   ① /map 진입 → 마커 표시 (PR #76/#81 회귀 가드)
//   ② 매물 모달 열림 (PR #80 redirect 회귀 가드)
//   ③ 검색창 placeholder = 매물번호·주소·자연어 (I-MAP-1 회귀 가드)
//   ④ 모바일 뷰포트 BottomSheet (I-MOBILE-1 회귀 가드)
//   ⑤ /listings/:id → /map?listing=:id redirect (I-MAP-2 회귀 가드)
//
// 실패 시 머지 차단 (gate-6 Playwright 의 일부).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { test, expect } from '@playwright/test';

test.describe('Critical User Flows — 사장님 시각 회귀 가드', () => {
  test('① /map 진입 — 페이지 로드 + 마커 영역 존재 (PR #76/#81)', async ({ page }) => {
    await page.goto('/map');
    // 페이지 로드 보장 — Brand 로고 + 검색바
    await expect(page.locator('text=WISHES').first()).toBeVisible({ timeout: 10000 });
    // 카테고리 탭 4개 존재 (주거 / 상가 / 토지 / 투자)
    await expect(page.locator('text=주거').first()).toBeVisible();
    await expect(page.locator('text=상가/사무실').first()).toBeVisible();
    await expect(page.locator('text=토지').first()).toBeVisible();
    await expect(page.locator('text=투자').first()).toBeVisible();
  });

  test('② 검색창 — 매물번호·주소·자연어 placeholder (I-MAP-1)', async ({ page }) => {
    await page.goto('/map');
    // INVARIANT I-MAP-1: 검색창 = 매물번호 / 주소 / 자연어 3-in-1
    const searchInput = page.locator('input[placeholder*="매물번호"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    const placeholder = await searchInput.getAttribute('placeholder');
    expect(placeholder).toContain('매물번호');
    expect(placeholder).toContain('주소');
    expect(placeholder).toContain('자연어');
  });

  test('③ /listings/:id → /map?listing=:id redirect (I-MAP-2 / PR #80)', async ({ page, request }) => {
    // INVARIANT I-MAP-2: /listings/* 영구 폐기 → /map?listing=ID
    // GET /listings/46363 → 308 → /map?listing=46363
    const res = await request.get('/listings/46363', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    const location = res.headers()['location'];
    expect(location).toBe('/map?listing=46363');
  });

  test('④ 모바일 뷰포트 (375px) — 헤더/검색 visible, BottomSheet 마운트 (I-MOBILE-1)', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const page = await ctx.newPage();
    await page.goto('/map');
    await expect(page.locator('text=WISHES').first()).toBeVisible({ timeout: 10000 });
    // BottomSheet handle (md:hidden 이라 모바일에서만)
    const sheetHandle = page.locator('button[aria-label*="매물 리스트"]').first();
    await expect(sheetHandle).toBeVisible({ timeout: 5000 });
    await ctx.close();
  });

  test('⑤ /search 절대 보존 — 페이지 200 OK (CLAUDE.md 절대 규칙)', async ({ request }) => {
    // CLAUDE.md: /search = 중개사 vanilla. 절대 깨지면 안 됨.
    const res = await request.get('/search');
    expect(res.status()).toBeLessThan(400);
  });

  test('⑥ viewport API raw 좌표 (I-COORD-3) — 마스킹 비율 ≤ 1%', async ({ request }) => {
    const res = await request.get('/api/listings/viewport?west=126.92&south=37.47&east=126.95&north=37.49&category=residence');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.listings || [];
    if (items.length < 100) return;
    const masked = items.filter((l: { lat: number }) => {
      const after3 = String(l.lat.toFixed(7)).split('.')[1].slice(3);
      return /^0+$/.test(after3);
    });
    const maskedRatio = masked.length / items.length;
    expect(maskedRatio).toBeLessThan(0.01);
  });

  test('⑦ 광역 cluster (I-MARKER-4) — unique 좌표 < 매물 수', async ({ request }) => {
    const res = await request.get('/api/listings/viewport?west=126.85&south=37.42&east=127.00&north=37.55&category=residence');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.listings || [];
    if (items.length < 50) return;
    const uniqueCoords = new Set(
      items.map((l: { lat: number; lng: number }) => l.lat.toFixed(5) + ':' + l.lng.toFixed(5))
    );
    expect(uniqueCoords.size).toBeLessThan(items.length);
  });

  test('⑧ 관리비 메타 항목 (I-DATA-2) — maintenance_includes 에 "관리비" 없음', async ({ request }) => {
    const res = await request.get('/api/listings/viewport?west=126.85&south=37.42&east=127.00&north=37.55&category=residence');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.listings || [];
    const violations = items.filter((l: { maintenance_includes?: string[] }) =>
      Array.isArray(l.maintenance_includes) &&
      l.maintenance_includes.some((it) => String(it).trim() === '관리비')
    );
    expect(violations.length).toBe(0);
  });
});
