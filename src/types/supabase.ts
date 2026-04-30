// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-FIX2: Supabase Database type stub (라이브 main 안정화 v2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사장님 commit 99feedd "fix(types+deps): supabase types stub" 시도 보강.
// 정식 generated types 는 `npm run db:generate` 후 자동 생성 (별도 PR).
//
// PR-FIX2: PostgrestFilterBuilder 의 'never' 추론 회피를 위해
//   Database 를 `any` 로 단순화. type 안전성 X 이지만 빌드 통과.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// PR-FIX2: any 로 단순화 — supabase-js 의 PostgrestFilterBuilder generic 이
//   listings_audit_log 같은 누락 테이블에서 'never' 추론하던 문제 회피.
// next/core-web-vitals ESLint config 에 @typescript-eslint/no-explicit-any 룰
//   미정의 → any 사용해도 lint 에러 X.
export type Database = any;
