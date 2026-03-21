/**
 * @file match-alert-helpers.ts
 *
 * @description Server-side-only helpers for creating match alerts and checking
 * dedup limits. These are NOT server actions — they cannot be called from the
 * client. Only called from other server-side code (messaging.ts, talent-match route).
 *
 * @security These functions are internal. They are NOT exported from a "use server"
 * file, preventing direct client invocation.
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AlertType } from "@/actions/match-alerts"

/**
 * Helper to query tables not yet in the generated Supabase types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedFrom(supabase: SupabaseClient, table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase as any).from(table)
}

/**
 * Create a match alert for a user (called by server-side code only).
 *
 * @description Uses the admin client to bypass RLS — this is a system-level
 * operation, not a user-initiated action.
 *
 * @security Server-side only. NOT a server action. Uses admin client.
 */
export async function createMatchAlert(
    userId: string,
    type: AlertType,
    title: string,
    description?: string,
    listingId?: string,
    metadata?: Record<string, unknown>
) {
    const supabase = createAdminClient()

    const { error } = await untypedFrom(supabase, 'match_alerts')
        .insert({
            user_id: userId,
            type,
            title,
            description: description || null,
            listing_id: listingId || null,
            metadata: metadata || {},
        })

    if (error) {
        console.error('[MatchAlerts] Create error:', error)
        return { success: false, error: 'Failed to create alert' }
    }

    return { success: true, error: null }
}

/**
 * Check if a new alert can be created for a user (dedup/cooldown).
 *
 * @description Prevents alert spam by checking how many alerts of a given
 * type were created for a user in the last `cooldownMs` period. Returns
 * true if under the `maxCount` threshold.
 *
 * @security Server-side only. NOT a server action. Uses admin client.
 */
export async function canCreateAlert(
    userId: string,
    type: AlertType,
    maxCount: number = 5,
    cooldownMs: number = 24 * 60 * 60 * 1000
): Promise<boolean> {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - cooldownMs).toISOString()

    const { count, error } = await untypedFrom(supabase, 'match_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', type)
        .gte('created_at', since)

    if (error) {
        console.error('[MatchAlerts] Dedup check error:', error)
        return false // Fail closed — don't spam
    }

    return (count || 0) < maxCount
}
