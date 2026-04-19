/**
 * Feature flag reads (server-side).
 *
 * Flags live in `profiles.feature_flags jsonb`. Absent key = false.
 *
 * Usage from a server component or server action:
 *
 *   const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_FORGE_EXPERIENCE)
 *
 * Usage when you already have a Supabase client + user id (e.g. inside
 * withAuth wrapper):
 *
 *   const enabled = await getFeatureFlag(supabase, userId, FLAG_NEW_FORGE_EXPERIENCE)
 *
 * Client-component usage: import `useFeatureFlag` from
 * `src/lib/features/use-feature-flag.ts`.
 */

import { createClient, type TypedSupabaseClient } from '@/lib/supabase/server'
import type { FeatureFlagKey } from './keys'

export async function getFeatureFlag(
  supabase: TypedSupabaseClient,
  userId: string | null | undefined,
  key: FeatureFlagKey,
): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await supabase
    .from('profiles')
    .select('feature_flags')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false

  const flags = (data.feature_flags ?? {}) as Record<string, unknown>
  return flags[key] === true
}

export async function getCurrentUserFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return getFeatureFlag(supabase, user?.id ?? null, key)
}

/**
 * Throws if the flag is not enabled for the current user. Use at the top of a
 * flagged route handler:
 *
 *   export default async function Page() {
 *     await requireFeatureFlag(FLAG_NEW_FORGE_EXPERIENCE)
 *     // ... renders only if flag on
 *   }
 *
 * Pair with a Next.js `notFound()` catch for a clean 404 when flag is off.
 */
export async function requireFeatureFlag(key: FeatureFlagKey): Promise<void> {
  const enabled = await getCurrentUserFeatureFlag(key)
  if (!enabled) {
    throw new Error(`feature_flag_off:${key}`)
  }
}
