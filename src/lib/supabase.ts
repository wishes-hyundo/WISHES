import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ì¼ë° Supabase í´ë¼ì´ì¸í¸ (ìë² ì»´í¬ëí¸ì©, ì¸ì ìì)
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ì±ê¸í° ì¸ì¦ í´ë¼ì´ì¸í¸ (ìì ë¡ê·¸ì¸ì©, í´ë¼ì´ì¸í¸ ì»´í¬ëí¸ììë§ ì¬ì©)
let authClientInstance: ReturnType<typeof createSupabaseClient> | null = null;

export function createAuthClient() {
  if (typeof window === 'undefined') {
    throw new Error('createAuthClient can only be called on the client');
  }
  if (authClientInstance) return authClientInstance;
  authClientInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'wishes-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return authClientInstance;
}

// Alias for backward compatibility with admin routes
export const createServerClient = createClient;
