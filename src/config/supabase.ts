import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file.');
  process.exit(1);
}

// ব্যাকএন্ডের জন্য auth সেটিংস কাস্টমাইজ করা হলো যাতে কোনো সেশন কনফ্লিক্ট না হয়
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

console.log('🚀 [Supabase Config] Client initialized properly with Server-Safe settings.');
