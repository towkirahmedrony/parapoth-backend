import { createClient } from '@supabase/supabase-js';

/** Create a non-persistent client whose Authorization header is the verified user's JWT. */
export const createUserSupabaseClient = (accessToken: string) => {
  const url = process.env.SUPABASE_URL || '';
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !apiKey || !accessToken) throw new Error('Authorization service unavailable');
  return createClient(url, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};
