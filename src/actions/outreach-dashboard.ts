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

export interface NextAction {
    type: 'enrich' | 'import' | 'generate' | 'send' | 'follow_up' | 'review_reply'
    priority: 'high' | 'medium' | 'low'
    title: string
    description: string
    count: number
    actionUrl: string
}

export interface DashboardData {
    pipeline: PipelineStats
    nextActions: NextAction[]
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
    const { data: contacts } = await supabase
        .from('outreach_contacts')
        .select('status')
        .eq('foundry_id', foundry_id)

    const totalOutreachContacts = contacts?.length || 0

    // FLOW: Get email stats — how many are approved but not sent
    const { data: pendingEmails } = await supabase
        .from('outreach_emails')
        .select('id')
        .eq('foundry_id', foundry_id)
        .eq('status', 'approved')
        .is('sent_at', null)

    const pendingEmailCount = pendingEmails?.length || 0

    // FLOW: Count contacts that replied (need review)
    const repliedContacts = contacts?.filter(c => c.status === 'replied').length || 0

    // FLOW: Count contacts that are new/researched but don't have sequences yet
    const needsSequenceContacts = contacts?.filter(c =>
        c.status === 'new' || c.status === 'researched' || c.status === 'scored' || c.status === 'approved'
    ).length || 0

    // FLOW: Count campaigns
    const { count: campaignCount } = await supabase
        .from('outreach_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundry_id)

    // INTENT: Build prioritised next actions
    const nextActions: NextAction[] = []
    const notEnriched = pipeline.total - pipeline.enriched - pipeline.notRelevant

    if (notEnriched > 0) {
        nextActions.push({
            type: 'enrich',
            priority: pipeline.enriched === 0 ? 'high' : 'medium',
            title: `Enrich ${notEnriched} companies`,
            description: 'Add contact emails to marketplace listings so they can be imported into campaigns',
            count: notEnriched,
            actionUrl: '/outreach/enrichment?email=no_email',
        })
    }

    if (pipeline.ready > 0) {
        nextActions.push({
            type: 'import',
            priority: 'high',
            title: `Import ${pipeline.ready} ready contacts`,
            description: 'Enriched listings with emails ready to be imported into a campaign',
            count: pipeline.ready,
            actionUrl: '/outreach/enrichment?status=ready',
        })
    }

    if (needsSequenceContacts > 0) {
        nextActions.push({
            type: 'generate',
            priority: 'medium',
            title: `Generate sequences for ${needsSequenceContacts} contacts`,
            description: 'Contacts imported but without email sequences — generate personalised emails',
            count: needsSequenceContacts,
            actionUrl: '/outreach',
        })
    }

    if (pendingEmailCount > 0) {
        nextActions.push({
            type: 'send',
            priority: 'high',
            title: `Send ${pendingEmailCount} approved emails`,
            description: 'Emails approved and ready to send — copy to your email client or send directly',
            count: pendingEmailCount,
            actionUrl: '/outreach',
        })
    }

    if (repliedContacts > 0) {
        nextActions.push({
            type: 'review_reply',
            priority: 'high',
            title: `Review ${repliedContacts} replies`,
            description: 'Contacts have replied to your outreach — follow up to convert',
            count: repliedContacts,
            actionUrl: '/outreach',
        })
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    nextActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    return {
        data: {
            pipeline,
            nextActions,
            campaignCount: campaignCount || 0,
            totalOutreachContacts,
        },
    }
}
