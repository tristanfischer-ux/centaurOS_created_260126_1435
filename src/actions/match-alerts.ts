"use server"

import { createClient } from "@/lib/supabase/server"
import { withUser, withAuth } from '@/lib/server-action-utils'
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Helper to query tables not yet in the generated Supabase types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedFrom(supabase: SupabaseClient, table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase as any).from(table)
}

/**
 * @file match-alerts.ts
 *
 * @description Server actions for the match alerts system. Handles creating,
 * reading, and managing alerts that notify users when new experts match their
 * needs, saved experts get updates, or new talent joins their industry.
 *
 * @security All actions require authenticated user. RLS ensures users only
 * see their own alerts.
 */

export type AlertType = 'new_match' | 'saved_update' | 'industry_join' | 'weekly_digest' | 'endorsement' | 'talent_search' | 'contact_enquiry'

export interface MatchAlert {
    id: string
    user_id: string
    type: AlertType
    title: string
    description: string | null
    listing_id: string | null
    metadata: Record<string, unknown>
    read_at: string | null
    dismissed_at: string | null
    created_at: string
}

export interface AlertCounts {
    total: number
    unread: number
    byType: Record<AlertType, number>
}

/**
 * Get alerts for the current user.
 *
 * @param options - Filter and pagination options
 * @returns Array of alerts
 *
 * @security RLS ensures users only see their own alerts.
 */
export async function getMatchAlerts(options?: {
    type?: AlertType
    unreadOnly?: boolean
    limit?: number
}): Promise<MatchAlert[]> {
    return withUser(async ({ supabase, user }) => {
        let query = untypedFrom(supabase, 'match_alerts')
            .select('*')
            .eq('user_id', user.id)
            .is('dismissed_at', null)
            .order('created_at', { ascending: false })
            .limit(options?.limit || 20)

        if (options?.type) {
            query = query.eq('type', options.type)
        }

        if (options?.unreadOnly) {
            query = query.is('read_at', null)
        }

        const { data, error } = await query

        if (error) {
            console.error('[MatchAlerts] Fetch error:', error)
            return []
        }

        return (data || []) as MatchAlert[]
    }) as Promise<MatchAlert[]>
}

/**
 * Get alert counts for the current user.
 *
 * @returns Total, unread, and by-type counts
 */
export async function getAlertCounts(): Promise<AlertCounts> {
    return withUser(async ({ supabase, user }) => {
        const { data, error } = await untypedFrom(supabase, 'match_alerts')
            .select('type, read_at, dismissed_at')
            .eq('user_id', user.id)
            .is('dismissed_at', null)

        if (error || !data) {
            return {
                total: 0,
                unread: 0,
                byType: {} as Record<AlertType, number>,
            }
        }

        const byType: Record<string, number> = {}
        let unread = 0

        for (const alert of data) {
            byType[alert.type] = (byType[alert.type] || 0) + 1
            if (!alert.read_at) unread++
        }

        return {
            total: data.length,
            unread,
            byType: byType as Record<AlertType, number>,
        }
    }) as Promise<AlertCounts>
}

/**
 * Get unread alert count for sidebar badge.
 *
 * @returns Number of unread, undismissed alerts
 */
export async function getUnreadAlertCount(): Promise<number> {
    return withUser(async ({ supabase, user }) => {
        const { count, error } = await untypedFrom(supabase, 'match_alerts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('read_at', null)
            .is('dismissed_at', null)

        if (error) {
            console.error('[MatchAlerts] Count error:', error)
            return 0
        }

        return count || 0
    }) as Promise<number>
}

/**
 * Mark an alert as read.
 *
 * @param alertId - The alert to mark as read
 */
export async function markAlertRead(alertId: string) {
    return withUser(async ({ supabase, user }) => {
        const { error } = await untypedFrom(supabase, 'match_alerts')
            .update({ read_at: new Date().toISOString() })
            .eq('id', alertId)
            .eq('user_id', user.id)

        if (error) {
            console.error('[MatchAlerts] Mark read error:', error)
            return { success: false, error: 'Failed to mark alert as read' }
        }

        revalidatePath('/recruits')
        return { success: true, error: null }
    })
}

/**
 * Mark all alerts as read.
 */
export async function markAllAlertsRead() {
    return withUser(async ({ supabase, user }) => {
        const { error } = await untypedFrom(supabase, 'match_alerts')
            .update({ read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .is('read_at', null)

        if (error) {
            console.error('[MatchAlerts] Mark all read error:', error)
            return { success: false, error: 'Failed to mark alerts as read' }
        }

        revalidatePath('/recruits')
        return { success: true, error: null }
    })
}

/**
 * Dismiss an alert (hide it permanently).
 *
 * @param alertId - The alert to dismiss
 */
export async function dismissAlert(alertId: string) {
    return withUser(async ({ supabase, user }) => {
        const { error } = await untypedFrom(supabase, 'match_alerts')
            .update({ dismissed_at: new Date().toISOString() })
            .eq('id', alertId)
            .eq('user_id', user.id)

        if (error) {
            console.error('[MatchAlerts] Dismiss error:', error)
            return { success: false, error: 'Failed to dismiss alert' }
        }

        revalidatePath('/recruits')
        return { success: true, error: null }
    })
}

/**
 * Create a match alert for a user (called by background jobs).
 *
 * @description This is a server-side function called by background processes
 * (webhooks, cron jobs) to create alerts. Not directly callable by users.
 *
 * @param userId - The user to alert
 * @param type - Alert type
 * @param title - Alert title
 * @param description - Optional description
 * @param listingId - Optional related listing
 * @param metadata - Optional additional data
 *
 * @security Server-side only. Uses service-level RLS policy.
 */
export async function createMatchAlert(
    userId: string,
    type: AlertType,
    title: string,
    description?: string,
    listingId?: string,
    metadata?: Record<string, unknown>
) {
    const supabase = await createClient()

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
 * @param userId - The user to check
 * @param type - Alert type
 * @param maxCount - Max alerts allowed in the window (default 5)
 * @param cooldownMs - Time window in ms (default 24 hours)
 */
export async function canCreateAlert(
    userId: string,
    type: AlertType,
    maxCount: number = 5,
    cooldownMs: number = 24 * 60 * 60 * 1000
): Promise<boolean> {
    const supabase = await createClient()
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
