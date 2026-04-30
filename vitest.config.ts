// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vitest config — L-sec131 (2026-04-23) + PR-E 회귀 안전망 (2026-04-30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 감사(L-audit-2026-04-22) H-4 대응 테스트 하네스 phase 1.
// 목표: 지금까지 잡은 보안 회귀(IDOR, role escalation, rate limit, ilike
//   wildcard injection) 를 "다음 커밋이 똑같은 실수를 다시 만들면 테스트가
//   즉시 빨간불" 상태로 만드는 것.
//
// phase 1 (이번): 외부 의존성 없는 pure lib 단위 테스트.
//   - src/lib/sqlEscape.test.ts    (ilike wildcard 리터럴화)
//   - src/lib/rateLimit.test.ts    (슬라이딩 윈도우 한도/회복)
//   - src/lib/adminAuth.test.ts    (토큰 형식 게이팅)
//
// phase 2 (후속): supabase-js + NextRequest 모킹으로 라우트 단위 회귀.
//   - admin/listings/[id] DELETE — 타 에이전트 매물 삭제 → 403
//   - admin/users PUT change_role — agent → superadmin 자가승격 → 403
//
// PR-E (RFC 0001, §125): 회귀 안전망 베이스라인 보강.
//   - tests/unit/filters-baseline.test.ts (현재 동작 capture — formatFloorNumber 등)
//   - tests/setup.ts (supabase mock helper, 단계 4 에서 msw 추가)
//   - tests/golden/ (단계 4 — 사회초년생/신혼부부/사업자 50 케이스)
//   - tests/dom-snapshot/ (단계 6 — 4 페이지 렌더 capture)

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      // L-sec131 phase 1 — src/ 안에 동거하는 단위 테스트
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      // PR-E (RFC 0001) — tests/ 디렉토리 베이스라인 + 골든 + 스냅샷
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
    // Next.js/Supabase 의 내부 서브-프로세스 경로 배제
    // PR-E §125.1 단계 6: tests/dom-snapshot 은 Playwright 별도 runner — vitest 제외
    exclude: ['node_modules', '.next', 'dist', 'tests/dom-snapshot/**'],
    // L-sec131 + PR-E:
    //   1) vitest.setup.ts — supabase env throw 방지 (모듈 로드 가능)
    //   2) tests/setup.ts  — supabase mock helper (단계 2~), msw setupServer (단계 4~)
    setupFiles: ['./vitest.setup.ts', './tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
