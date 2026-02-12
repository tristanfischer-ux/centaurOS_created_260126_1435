import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

/**
 * Type-safe Supabase client for server-side operations.
 * Use this instead of `any` when passing the Supabase client to helper functions.
 * 
 * @example
 * ```ts
 * import type { TypedSupabaseClient } from '@/lib/supabase/server'
 * 
 * async function myHelper(supabase: TypedSupabaseClient) {
 *   const { data } = await supabase.from('tasks').select()
 * }
 * ```
 */
export type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
        throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
    }
    
    const cookieStore = await cookies()

    return createServerClient<Database>(url, key, {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}
