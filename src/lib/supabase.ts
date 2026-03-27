// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Supabase 클라이언트 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * 브라우저 클라이언트 (Anonymous Key)
 * - 공개 API 엔드포인트 사용
 * - RLS 정책 적용됨
 */
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * 브라우저 인증 클라이언트 (Anonymous Key + 세션 유지)
 * - 사용자 로그인/회원가입용
 * - localStorage에 세션 저장
 */
let authClientInstance: ReturnType<typeof createSupabaseClient> | null = null;

export function createAuthClient() {
  if (typeof window === 'undefined') {
    // 서버사이드에서는 싱글턴 없이 새로 생성
    return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  if (authClientInstance) return authClientInstance;
  authClientInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'wishes-auth',
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return authClientInstance;
}

/**
 * 서버 클라이언트 (Service Role Key)
 * - 관리자 API 엔드포인트 사용
 * - RLS 정책 우회
 * - 서버 사이드에서만 사용 (환경변수 보호)
 */
export function createServerClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default {
  createClient,
  createServerClient,
};
