/**
 * WISHES — Supabase client factory (unified)
 * ============================================================
 * Exports three named factories used across the app:
 *
 *   createServerClient() → service-role (admin, bypasses RLS)
 *   createClient()       → alias of createServerClient for legacy routes
 *   createAuthClient()   → anon/public key (browser & auth flows)
 *
 * 🔴 CRITICAL — DO NOT rewrite env access with a dynamic helper like
 *   function requireEnv(name){ return process.env[name] }
 * Next.js only inlines NEXT_PUBLIC_* values when accessed as a LITERAL
 * property (process.env.NEXT_PUBLIC_FOO). A dynamic key breaks static
 * replacement, leaving the client bundle with `undefined` and causing
 * every client-side call to throw — cascading into a full
 * "Application error: client-side exception" on hydration.
 * Keep these three reads at the top level with literal property access.
 *
 * Environment variables on Vercel:
 *   NEXT_PUBLIC_SUPABASE_URL        — project URL (inlined at build)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   — anon key (inlined at build, safe)
 *   SUPABASE_SERVICE_ROLE_KEY       — service-role secret (server-only)
 */

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

// ── Static env access — MUST use literal property names for Next.js inlining ──
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('[supabase] Missing env var: NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('[supabase] Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/** Server-side privileged client (service_role key). Never expose to browser. */
export function createServerClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('[supabase] Missing env var: SUPABASE_SERVICE_ROLE_KEY');
  }
  return createSupabaseClient(supabaseUrl as string, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Legacy alias — older routes import `createClient` from this module.
 * Returns the service-role client (same as createServerClient).
 */
export function createClient(): SupabaseClient {
  return createServerClient();
}

/** Browser/auth flow client (anon key). Safe for client components. */
// Singleton so repeated createAuthClient() calls share session state.
let authClientInstance: SupabaseClient | null = null;
export function createAuthClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // SSR: new instance each call, no session persistence
    return createSupabaseClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  if (authClientInstance) return authClientInstance;
  authClientInstance = createSupabaseClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return authClientInstance;
}


/**
 * L-rls1 Phase 1 (2026-04-23): user-scoped anon client.
 *
 * 사용자의 Supabase access_token(JWT) 을 Authorization 헤더로 주입해
 * PostgREST 가 auth.uid() 를 해당 사용자로 인식하게 한다. 추후 RLS 정책이
 * auth.uid() = created_by 로 좁혀질 때, 이 클라이언트가 agent 본인 매물만
 * 보이도록 자연스럽게 scope 된다 (service_role 이 아니므로 bypass 안됨).
 *
 * Phase 1 단계에서는 shadow policy(USING true)가 깔려 있어 기능 차이가 없지만,
 * 새 라우트는 가능하면 이 팩토리를 쓰도록 유도. Phase 2 에서 정책을
 * is_admin_unlimited() / auth.uid() = created_by 로 교체 시 별도 코드 변경 없이
 * 권한이 자동 반영된다.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!accessToken || accessToken.length < 10) {
    throw new Error('[supabase] createUserClient requires a non-empty accessToken');
  }
  return createSupabaseClient(supabaseUrl as string, supabaseAnonKey as string, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
