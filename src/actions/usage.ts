'use server'

/**
 * Usage Tracking Server Actions
 *
 * @description Fetches current usage counts for subscription limit tracking.
 * Returns orders this month, team members, and active retainers for the
 * authenticated user's foundry.
 *
 * @security Requires authenticated user. Scoped to user's foundry.
 */

import { createClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth } from 'date-fns'

export interface UsageData {
  ordersThisMonth: number
  teamMembers: number
  activeRetainers: number
}

/**
 * Get current usage metrics for the authenticated user's foundry
 *
 * @returns Usage counts for orders, team members, and retainers
 * @security Requires authenticated user with foundry membership
 */
export async function getUsageMetrics(): Promise<{
  usage: UsageData | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { usage: null, error: 'Not authenticated' }
    }

    // Get user's foundry
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) {
      return {
        usage: { ordersThisMonth: 0, teamMembers: 1, activeRetainers: 0 },
        error: null,
      }
    }

    const foundryId = profile.foundry_id
    const now = new Date()
    const monthStart = startOfMonth(now).toISOString()
    const monthEnd = endOfMonth(now).toISOString()

    // Fetch all counts in parallel
    const [ordersResult, membersResult, retainersResult] = await Promise.all([
      // Orders this month
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // Team members
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundryId),

      // Active retainers
      supabase
        .from('retainers')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .eq('status', 'active'),
    ])

    return {
      usage: {
        ordersThisMonth: ordersResult.count ?? 0,
        teamMembers: membersResult.count ?? 0,
        activeRetainers: retainersResult.count ?? 0,
      },
      error: null,
    }
  } catch (error) {
    console.error('[UsageService] Error fetching usage metrics:', error)
    return { usage: null, error: 'Failed to fetch usage data' }
  }
}
