import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service_role key for admin operations.
 * This bypasses Row Level Security and should only be used for:
 * - Server-to-server callbacks (webhooks)
 * - Admin operations that require elevated privileges
 * - Background jobs
 * 
 * SECURITY: Never expose this client to the browser.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin configuration')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
