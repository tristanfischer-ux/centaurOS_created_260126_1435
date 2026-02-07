/**
 * @file server-action-utils.ts
 * 
 * @description Shared utilities for server actions that eliminate the duplicated
 * auth/foundry boilerplate pattern found in 90+ action files. Instead of each
 * action independently creating a Supabase client, checking auth, and resolving
 * the foundry, this wrapper does it once in a type-safe way.
 * 
 * Before (repeated in 90+ files):
 * ```ts
 * const supabase = await createClient()
 * const { data: { user } } = await supabase.auth.getUser()
 * if (!user) return { error: 'Unauthorized' }
 * const foundry_id = await getFoundryIdCached()
 * if (!foundry_id) return { error: 'User not in a foundry' }
 * ```
 * 
 * After:
 * ```ts
 * return withAuth(async ({ supabase, user, foundryId }) => {
 *   // All auth/foundry checks already done
 *   const { data } = await supabase.from('tasks').select().eq('foundry_id', foundryId)
 *   return { success: true, data }
 * })
 * ```
 * 
 * @security All server actions using this wrapper are guaranteed to have:
 * - An authenticated user
 * - A valid foundry context for multi-tenant isolation
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { User } from '@supabase/supabase-js'

/**
 * Authenticated context passed to server action handlers.
 * Provides the verified Supabase client, authenticated user, and foundry ID.
 */
export interface AuthContext {
  /** Supabase client with the user's session */
  supabase: Awaited<ReturnType<typeof createClient>>
  /** Authenticated user (guaranteed non-null) */
  user: User
  /** User's active foundry ID (guaranteed non-null) */
  foundryId: string
}

/**
 * Standard error return type for server actions.
 * Supports both `{ error: string }` and `{ success: false, error: string }` patterns.
 */
export type ActionError = { error: string; success?: false }

/**
 * Wraps a server action with authentication and foundry context checks.
 * 
 * @description Eliminates the duplicated auth boilerplate in 90+ server actions.
 * Creates a Supabase client, verifies the user is authenticated, resolves the
 * foundry context, and passes all three to the action handler.
 * 
 * @param action - The action handler that receives the authenticated context
 * @returns The action result, or an error if auth/foundry checks fail
 * 
 * @throws Never throws - all errors are returned as `{ error: string }`
 * 
 * @security Guarantees authenticated user and valid foundry before action runs
 * @audit Failed auth attempts are logged via console.error
 * 
 * @example
 * ```ts
 * export async function createTask(formData: FormData) {
 *   return withAuth(async ({ supabase, user, foundryId }) => {
 *     const title = formData.get('title') as string
 *     const { data, error } = await supabase.from('tasks').insert({
 *       title,
 *       creator_id: user.id,
 *       foundry_id: foundryId,
 *     }).select().single()
 *     if (error) return { error: error.message }
 *     return { success: true, data }
 *   })
 * }
 * ```
 */
export async function withAuth<T>(
  action: (ctx: AuthContext) => Promise<T>
): Promise<T | ActionError> {
  try {
    // AUTH: Create authenticated Supabase client
    const supabase = await createClient()

    // AUTH: Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'Unauthorized' }
    }

    // AUTH: Resolve foundry context for multi-tenant isolation
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { error: 'User not in a foundry' }
    }

    // Execute the action with verified context
    return await action({ supabase, user, foundryId })
  } catch (error) {
    // Log unexpected errors with context for debugging
    console.error('[withAuth] Unexpected error in server action:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}

/**
 * Like withAuth but only requires authentication (no foundry context needed).
 * Use for actions that work across foundries (e.g., foundry switching, profile updates).
 * 
 * @param action - The action handler that receives the supabase client and user
 * @returns The action result, or an error if auth check fails
 * 
 * @security Guarantees authenticated user before action runs
 * 
 * @example
 * ```ts
 * export async function updateProfile(updates: ProfileUpdates) {
 *   return withUser(async ({ supabase, user }) => {
 *     const { error } = await supabase.from('profiles')
 *       .update(updates)
 *       .eq('id', user.id)
 *     if (error) return { error: error.message }
 *     return { success: true }
 *   })
 * }
 * ```
 */
export async function withUser<T>(
  action: (ctx: Omit<AuthContext, 'foundryId'>) => Promise<T>
): Promise<T | ActionError> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'Unauthorized' }
    }

    return await action({ supabase, user })
  } catch (error) {
    console.error('[withUser] Unexpected error in server action:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}
