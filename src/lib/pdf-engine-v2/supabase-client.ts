import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client for PDF Engine V2.
 * Uses service role key if available, falls back to anon key.
 */
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  // Use service role key if available (bypasses RLS)
  // Falls back to anon key (may be limited by RLS)
  return createClient(url, serviceKey || anonKey)
}
