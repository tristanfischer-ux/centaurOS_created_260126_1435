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
import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import {
  sanitizeErrorMessage,
  extractRawErrorMessage,
} from '@/lib/security/sanitize'
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
 * TrustedContext — a verified identity passed by server-to-server callers
 * (Background specialists, autopilot dispatchers) that have ALREADY verified
 * auth upstream in the request chain but run in a post-response context
 * (`after()`, `/api/autopilot-step`, `/api/render-stage`) where cookies are
 * not available.
 *
 * When present, `withAuth` / `withUser` / `withAIGate` SKIP the cookie read
 * and `supabase.auth.getUser()` call, and inject this identity directly into
 * the wrapped callback. The inner `supabase` client becomes an admin client
 * (RLS-bypassed) — the trusted context proves ownership, so the caller is
 * responsible for filtering by `foundryId` in multi-tenant queries.
 *
 * **SECURITY CONTRACT (CRITICAL):**
 * - `TrustedContext` MUST ONLY be constructed server-side by code that has
 *   already verified the caller's identity (either via an upstream `withAuth`
 *   or a shared-secret gate like `/api/autopilot-step` / `/api/render-stage`).
 * - `TrustedContext` MUST NEVER be deserialised from an HTTP request body,
 *   query parameter, or header — doing so would allow clients to forge
 *   identity and bypass RLS entirely.
 * - Both fields are required. Do not accept null/undefined members.
 *
 * @see `src/actions/specialists/run-*.ts` — Background specialists that
 *      construct TrustedContext from the foundry-owner-fallback pattern.
 */
export interface TrustedContext {
  /** Verified user id (forged `User.id` in the downstream callback) */
  userId: string
  /** Verified foundry id (set as `foundryId` in the downstream callback) */
  foundryId: string
}

/**
 * Standard error return type for server actions.
 *
 * Supports both `{ error: string }` and `{ success: false, error: string }`
 * patterns AND carries an optional `rawError` field for the three-surface
 * error policy (see `src/lib/security/sanitize.ts` header for the full
 * policy).
 *
 *   - `error`    — SANITISED message suitable for the UI (surface 1)
 *   - `rawError` — RAW message + stack for DB persistence + console logs
 *                  (surfaces 2 and 3). Truncated to `RAW_ERROR_MAX_LEN`.
 *
 * Callers that persist to the DB or write to Vercel logs MUST prefer
 * `rawError` (falling back to `error` if the server action predates
 * the three-surface policy). The UI MUST ignore `rawError`.
 */
export type ActionError = {
  error: string
  rawError?: string
  success?: false
}

/**
 * ServerActionError — the canonical shape returned by server actions on
 * failure, carrying both the sanitised user-facing message AND the raw
 * developer-facing message + stack.
 *
 * This type is the contract for the three-surface error policy:
 *   - `userMessage` is surface 1 (UI-safe, sanitised)
 *   - `rawMessage`  is surfaces 2/3 (DB + console, unsanitised, truncated)
 *
 * Use `buildServerActionError(err)` to construct one from any thrown
 * value. Return it from server actions as
 * `{ error: err.userMessage, rawError: err.rawMessage }` — the wire shape
 * stays `ActionError` so existing callers keep working.
 */
export interface ServerActionError {
  userMessage: string
  rawMessage: string
}

/**
 * Construct a `ServerActionError` from any thrown value. Always safe to
 * call — never throws, always returns both fields populated.
 *
 * Use in `catch` blocks inside server actions to produce the two sides of
 * the three-surface policy in one call:
 *
 * ```ts
 * try {
 *   // ...
 * } catch (err) {
 *   const e = buildServerActionError(err)
 *   console.error('[my-action] failed:', e.rawMessage)  // surface 3
 *   return { error: e.userMessage, rawError: e.rawMessage }  // surfaces 1+2
 * }
 * ```
 */
export function buildServerActionError(error: unknown): ServerActionError {
  return {
    userMessage: sanitizeErrorMessage(error),
    rawMessage: extractRawErrorMessage(error),
  }
}

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
  action: (ctx: AuthContext) => Promise<T>,
  trusted?: TrustedContext
): Promise<T> {
  try {
    // TRUSTED BYPASS: When a server-to-server caller has already verified
    // auth upstream (e.g. Background specialist fired from /api/autopilot-step
    // or /api/render-stage, both of which are protected by a shared-secret
    // gate), they pass `trusted` to skip the cookie read entirely. The
    // downstream callback receives an admin client — the caller MUST filter
    // by foundryId explicitly for multi-tenant isolation.
    if (trusted) {
      const admin = createAdminClient()
      const user = { id: trusted.userId } as unknown as User
      return await action({
        supabase: admin as unknown as Awaited<ReturnType<typeof createClient>>,
        user,
        foundryId: trusted.foundryId,
      })
    }

    // AUTH: Create authenticated Supabase client
    const supabase = await createClient()

    // AUTH: Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      // SAFETY: All server actions return objects with `error` property on failure.
      // This cast is safe because the pre-migration code returned { error: string }
      // from the same functions, and callers already handle this case.
      // Three-surface policy: sanitised message is also raw for auth-fail
      // (no stack to hide), but we still populate rawError so DB writers
      // don't fall back to "Unauthorized" verbatim when they could be
      // recording a more specific authError.message. See sanitize.ts header.
      const rawAuth = authError
        ? extractRawErrorMessage(authError)
        : 'Unauthorized: no authenticated user'
      return { error: 'Unauthorized', rawError: rawAuth } as T
    }

    // AUTH: Resolve foundry context for multi-tenant isolation
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return {
        error: 'User not in a foundry',
        rawError: `getFoundryIdCached returned null for user ${user.id}`,
      } as T
    }

    // Execute the action with verified context
    return await action({ supabase, user, foundryId })
  } catch (error) {
    // Three-surface policy (P1.4):
    //   surface 3 (console/Vercel logs) — RAW Error.message + stack
    //   surface 2 (DB-destined rawError field) — RAW, truncated
    //   surface 1 (UI-destined error field) — SANITISED
    // See src/lib/security/sanitize.ts header for the full policy.
    const rawMessage = extractRawErrorMessage(error)
    console.error('[withAuth] Unexpected error in server action:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      rawMessage,
    })
    return {
      error: sanitizeErrorMessage(error),
      rawError: rawMessage,
    } as T
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
  action: (ctx: Omit<AuthContext, 'foundryId'>) => Promise<T>,
  trusted?: TrustedContext
): Promise<T> {
  try {
    // TRUSTED BYPASS: See `withAuth` for the contract. withUser does not
    // require a foundry, so only `trusted.userId` is used here.
    if (trusted) {
      const admin = createAdminClient()
      const user = { id: trusted.userId } as unknown as User
      return await action({
        supabase: admin as unknown as Awaited<ReturnType<typeof createClient>>,
        user,
      })
    }

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      const rawAuth = authError
        ? extractRawErrorMessage(authError)
        : 'Unauthorized: no authenticated user'
      return { error: 'Unauthorized', rawError: rawAuth } as T
    }

    return await action({ supabase, user })
  } catch (error) {
    // Three-surface policy (P1.4) — see sanitize.ts header.
    const rawMessage = extractRawErrorMessage(error)
    console.error('[withUser] Unexpected error in server action:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      rawMessage,
    })
    return {
      error: sanitizeErrorMessage(error),
      rawError: rawMessage,
    } as T
  }
}
