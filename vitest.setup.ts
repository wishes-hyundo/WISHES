// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vitest setup — L-sec131 (2026-04-23)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// src/lib/supabase.ts 는 모듈 로드 시점에 NEXT_PUBLIC_SUPABASE_* 가 없으면
// throw 한다 (런타임에서 의미 있는 에러를 빠르게 내려는 의도적 설계).
// 테스트 환경에선 실제 접속이 아닌 인증 형식 검증만 수행하므로, 여기서
// 더미 값을 주입해 모듈 로드가 성공하게 한다.
//
// 주의: 실제 supabase 호출을 하는 테스트는 vi.mock('@/lib/supabase', …) 로
// 개별 파일에서 모킹해야 한다. 이 setup 은 "모듈 로드 시 throw 방지" 만 담당.

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.invalid.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key-placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-placeholder';
