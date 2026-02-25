'use server'

/**
 * @file outreach-dashboard.ts — Server action for the outreach campaign dashboard.
 *
 * @description Provides pipeline stats, prioritised next actions, and activity
 * tracking for the marketing outreach workflow. Queries marketplace_listings
 * and outreach tables to compute the funnel metrics.
 *
 * @security Scoped to authenticated user's foundry.
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthContext() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' as const }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'Missing Foundry ID' as const }

    return { supabase, user, foundry_id }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineStats {
    total: number
    enriched: number
    ready: number
    imported: number
    contacted: number
    replied: number
    claimed: number
    onboarded: number
    notRelevant: number
}

export interface DashboardData {
    pipeline: PipelineStats
    campaignCount: number
    totalOutreachContacts: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Get the outreach dashboard data — pipeline funnel, next actions, activity.
 */
export async function getOutreachDashboard(): Promise<{ data?: DashboardData; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    // FLOW: Get marketplace listing stats by outreach_status
    const { data: listings, error: listErr } = await supabase
        .from('marketplace_listings')
        .select('outreach_status, contact_email')

    if (listErr) {
        console.error('[Dashboard] Failed to fetch listing stats:', listErr)
        return { error: 'Failed to fetch listing stats' }
    }

    const rows = listings || []
    const pipeline: PipelineStats = {
        total: rows.length,
        enriched: rows.filter(r => r.contact_email).length,
        ready: rows.filter(r => r.outreach_status === 'ready').length,
        imported: rows.filter(r => r.outreach_status === 'imported').length,
        contacted: rows.filter(r => r.outreach_status === 'contacted').length,
        replied: rows.filter(r => r.outreach_status === 'replied').length,
        claimed: rows.filter(r => r.outreach_status === 'claimed').length,
        onboarded: rows.filter(r => r.outreach_status === 'onboarded').length,
        notRelevant: rows.filter(r => r.outreach_status === 'not_relevant').length,
    }

    // FLOW: Get outreach contact stats for the foundry's campaigns
    const { count: totalOutreachContacts } = await supabase
        .from('outreach_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundry_id)

    // FLOW: Count campaigns
    const { count: campaignCount } = await supabase
        .from('outreach_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundry_id)

    return {
        data: {
            pipeline,
            campaignCount: campaignCount || 0,
            totalOutreachContacts: totalOutreachContacts || 0,
        },
    }
}
