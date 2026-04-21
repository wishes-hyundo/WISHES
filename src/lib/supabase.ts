/**
 * WISHES — Supabase server client factory
 * ============================================================
 * Creates a privileged Supabase client for server-side routes
 * (admin API, server components). Uses the service-role key so
 * it can read/write all rows regardless of RLS.
 *
 * Requires the following environment variables on Vercel:
 *   NEXT_PUBLIC_SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY      — service_role secret (NEVER expose to the browser)
 *
 * Consumed by:
 *   src/app/api/admin/listings/route.ts           (createServerClient)
 *   other future server-only Supabase callers
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      '[supabase] Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
