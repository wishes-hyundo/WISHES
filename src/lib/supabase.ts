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
