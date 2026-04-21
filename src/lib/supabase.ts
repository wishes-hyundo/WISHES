/**
 * WISHES — Supabase client factory (unified)
 * ============================================================
 * Exports three named factories used across the app:
 *
 *   createServerClient() → service-role (admin, bypasses RLS)
 *   createClient()       → alias of createServerClient for legacy routes
 *   createAuthClient()   → anon/public key (browser & auth flows)
 *
 * Environment variables on Vercel:
 *   NEXT_PUBLIC_SUPABASE_URL        — project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   — anon key (safe to expose)
 *   SUPABASE_SERVICE_ROLE_KEY       — service-role secret (server-only)
 */

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[supabase] Missing env var: ${name}`);
  return v;
}

/** Server-side privileged client (service_role key). Never expose to browser. */
export function createServerClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createSupabaseClient(url, serviceKey, {
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
export function createAuthClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
