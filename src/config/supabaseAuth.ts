import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';

// Prefer the public anon key for password/OTP flows. Falling back to the service
// role key keeps existing deployments working: Supabase's auth endpoints accept
// either key as the project apikey, and this client never touches table data.
const supabaseKey =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.');
}

/**
 * Auth-only client used for genuine credential verification and session
 * minting. It is never used for table reads/writes.
 */
export const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
