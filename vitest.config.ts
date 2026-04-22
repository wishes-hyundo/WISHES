// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vitest config — L-sec131 (2026-04-23)
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

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Next.js/Supabase 의 내부 서브-프로세스 경로 배제
    exclude: ['node_modules', '.next', 'dist'],
    // L-sec131: supabase.ts 모듈 로드 시 env throw 방지용 더미 주입
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
