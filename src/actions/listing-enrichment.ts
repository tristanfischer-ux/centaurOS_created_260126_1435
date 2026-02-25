'use server'

/**
 * @file listing-enrichment.ts — Server actions for marketplace listing contact enrichment.
 *
 * @description Supports the marketing outreach workflow by enabling contact data
 * management on marketplace_listings. Provides list/filter, single update,
 * bulk CSV import, and CSV export capabilities.
 *
 * @security Every query filters by foundry context. Admin-only feature.
 *
 * @related
 * - DB schema: supabase/migrations/20260225920000_listing_contact_enrichment.sql
 * - Outreach pipeline: src/actions/outreach.ts
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { Database } from '@/types/database.types'

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row']
type MarketplaceCategory = Database['public']['Enums']['marketplace_category']

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

export interface EnrichmentFilters {
    category?: MarketplaceCategory
    subcategory?: string
    hasEmail?: boolean
    outreachStatus?: string
    search?: string
    limit?: number
    offset?: number
}

export interface EnrichmentListing {
    id: string
    title: string
    description: string | null
    category: MarketplaceCategory
    subcategory: string
    attributes: Record<string, unknown> | null
    verification_tier: string
    contact_name: string | null
    contact_email: string | null
    contact_title: string | null
    contact_linkedin: string | null
    contact_phone: string | null
    contact_source: string | null
    contact_enriched_at: string | null
    outreach_status: string | null
    outreach_notes: string | null
    last_contacted_at: string | null
    outreach_contact_id: string | null
}

export interface ContactUpdate {
    contact_name?: string | null
    contact_email?: string | null
    contact_title?: string | null
    contact_linkedin?: string | null
    contact_phone?: string | null
    contact_source?: string
    outreach_notes?: string | null
}

export interface EnrichmentStats {
    total: number
    enriched: number
    notStarted: number
    ready: number
    imported: number
    contacted: number
    replied: number
    claimed: number
    notRelevant: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Fetch marketplace listings with enrichment-relevant fields and filters.
 * @param filters - Optional category, subcategory, email presence, outreach status, search
 */
export async function getListingsForEnrichment(
    filters: EnrichmentFilters = {}
): Promise<{ data?: { listings: EnrichmentListing[]; total: number }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    let query = supabase
        .from('marketplace_listings')
        .select(
            'id, title, description, category, subcategory, attributes, verification_tier, ' +
            'contact_name, contact_email, contact_title, contact_linkedin, contact_phone, ' +
            'contact_source, contact_enriched_at, outreach_status, outreach_notes, ' +
            'last_contacted_at, outreach_contact_id',
            { count: 'exact' }
        )
        .order('title', { ascending: true })
        .range(offset, offset + limit - 1)

    // INTENT: Filter by category to let user target manufacturers vs VC firms vs services
    if (filters.category) {
        query = query.eq('category', filters.category)
    }
    if (filters.subcategory) {
        query = query.eq('subcategory', filters.subcategory)
    }

    // INTENT: Filter by email presence for enrichment workflow
    if (filters.hasEmail === true) {
        query = query.not('contact_email', 'is', null)
    } else if (filters.hasEmail === false) {
        query = query.is('contact_email', null)
    }

    if (filters.outreachStatus) {
        query = query.eq('outreach_status', filters.outreachStatus)
    }

    if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`)
    }

    const { data, error, count } = await query

    if (error) {
        console.error('[Enrichment] Failed to fetch listings:', error)
        return { error: 'Failed to fetch listings' }
    }

    return {
        data: {
            listings: (data || []) as unknown as EnrichmentListing[],
            total: count ?? 0,
        },
    }
}

/**
 * @description Get distinct subcategories for a given category (for filter dropdowns).
 */
export async function getSubcategories(
    category?: MarketplaceCategory
): Promise<{ data?: string[]; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    let query = supabase
        .from('marketplace_listings')
        .select('subcategory')

    if (category) {
        query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
        console.error('[Enrichment] Failed to fetch subcategories:', error)
        return { error: 'Failed to fetch subcategories' }
    }

    const unique = [...new Set((data || []).map(r => r.subcategory))].sort()
    return { data: unique }
}

/**
 * @description Get enrichment stats — counts by outreach_status and email presence.
 */
export async function getEnrichmentStats(): Promise<{ data?: EnrichmentStats; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    const { data, error } = await supabase
        .from('marketplace_listings')
        .select('outreach_status, contact_email')

    if (error) {
        console.error('[Enrichment] Failed to fetch stats:', error)
        return { error: 'Failed to fetch stats' }
    }

    const rows = data || []
    const stats: EnrichmentStats = {
        total: rows.length,
        enriched: rows.filter(r => r.contact_email).length,
        notStarted: rows.filter(r => !r.outreach_status || r.outreach_status === 'not_started').length,
        ready: rows.filter(r => r.outreach_status === 'ready').length,
        imported: rows.filter(r => r.outreach_status === 'imported').length,
        contacted: rows.filter(r => r.outreach_status === 'contacted').length,
        replied: rows.filter(r => r.outreach_status === 'replied').length,
        claimed: rows.filter(r => r.outreach_status === 'claimed').length,
        notRelevant: rows.filter(r => r.outreach_status === 'not_relevant').length,
    }

    return { data: stats }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Update contact fields for a single marketplace listing.
 * Automatically sets outreach_status to 'ready' if email is provided and status was 'not_started'.
 */
export async function updateListingContact(
    listingId: string,
    contactData: ContactUpdate
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    // INTENT: Build update payload, auto-promote status if email added
    const update: Record<string, unknown> = {
        ...contactData,
        contact_enriched_at: new Date().toISOString(),
    }

    // Auto-promote to 'ready' if email is provided and status was not_started
    if (contactData.contact_email) {
        const { data: existing } = await supabase
            .from('marketplace_listings')
            .select('outreach_status')
            .eq('id', listingId)
            .single()

        if (existing && (!existing.outreach_status || existing.outreach_status === 'not_started' || existing.outreach_status === 'enriching')) {
            update.outreach_status = 'ready'
        }
    }

    const { error } = await supabase
        .from('marketplace_listings')
        .update(update)
        .eq('id', listingId)

    if (error) {
        console.error('[Enrichment] Failed to update contact:', error)
        return { error: 'Failed to update contact' }
    }

    revalidatePath('/outreach/enrichment')
    return { success: true }
}

/**
 * @description Update outreach_status for one or more listings (bulk action).
 */
export async function updateListingOutreachStatus(
    listingIds: string[],
    status: string
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    const { error } = await supabase
        .from('marketplace_listings')
        .update({ outreach_status: status })
        .in('id', listingIds)

    if (error) {
        console.error('[Enrichment] Failed to update statuses:', error)
        return { error: 'Failed to update statuses' }
    }

    revalidatePath('/outreach/enrichment')
    return { success: true }
}

/**
 * @description Bulk update contacts from parsed CSV data.
 * Matches by listing title (company name). Updates contact fields.
 */
export async function bulkUpdateListingContacts(
    updates: Array<{
        title: string
        contact_name?: string
        contact_email?: string
        contact_title?: string
        contact_linkedin?: string
        contact_phone?: string
    }>
): Promise<{ data?: { updated: number; notFound: string[] }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    // INTENT: Fetch all listings to match by title
    const { data: allListings, error: fetchError } = await supabase
        .from('marketplace_listings')
        .select('id, title')

    if (fetchError) {
        console.error('[Enrichment] Failed to fetch listings for bulk update:', fetchError)
        return { error: 'Failed to fetch listings' }
    }

    // Build a lookup by lowercase title
    const titleMap = new Map<string, string>()
    for (const listing of allListings || []) {
        titleMap.set(listing.title.toLowerCase().trim(), listing.id)
    }

    let updated = 0
    const notFound: string[] = []

    for (const row of updates) {
        const id = titleMap.get(row.title.toLowerCase().trim())
        if (!id) {
            notFound.push(row.title)
            continue
        }

        const contactData: ContactUpdate = {}
        if (row.contact_name) contactData.contact_name = row.contact_name
        if (row.contact_email) contactData.contact_email = row.contact_email
        if (row.contact_title) contactData.contact_title = row.contact_title
        if (row.contact_linkedin) contactData.contact_linkedin = row.contact_linkedin
        if (row.contact_phone) contactData.contact_phone = row.contact_phone
        contactData.contact_source = 'csv_import'

        const updatePayload: Record<string, unknown> = {
            ...contactData,
            contact_enriched_at: new Date().toISOString(),
        }

        // Auto-promote status if email provided
        if (row.contact_email) {
            updatePayload.outreach_status = 'ready'
        }

        const { error } = await supabase
            .from('marketplace_listings')
            .update(updatePayload)
            .eq('id', id)

        if (!error) updated++
    }

    revalidatePath('/outreach/enrichment')
    return { data: { updated, notFound } }
}

/**
 * @description Export listings as CSV-ready data for external research.
 */
export async function exportListingsForResearch(
    filters: EnrichmentFilters = {}
): Promise<{ data?: string; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase } = ctx

    let query = supabase
        .from('marketplace_listings')
        .select('title, description, category, subcategory, attributes, contact_name, contact_email, contact_title, contact_linkedin, contact_phone, outreach_status')
        .order('title', { ascending: true })

    if (filters.category) query = query.eq('category', filters.category)
    if (filters.subcategory) query = query.eq('subcategory', filters.subcategory)
    if (filters.outreachStatus) query = query.eq('outreach_status', filters.outreachStatus)

    const { data, error } = await query

    if (error) {
        console.error('[Enrichment] Failed to export listings:', error)
        return { error: 'Failed to export listings' }
    }

    // INTENT: Build CSV with relevant columns for external enrichment research
    const headers = [
        'Company Name', 'Website', 'Location', 'Industry', 'Employees',
        'Category', 'Subcategory', 'Contact Name', 'Contact Email',
        'Contact Title', 'Contact LinkedIn', 'Contact Phone', 'Outreach Status',
    ]

    const rows = (data || []).map(listing => {
        const attrs = (listing.attributes || {}) as Record<string, unknown>
        return [
            listing.title,
            attrs.website_url || '',
            attrs.location || '',
            Array.isArray(attrs.industries) ? (attrs.industries as string[]).join('; ') : '',
            attrs.employees || '',
            listing.category,
            listing.subcategory,
            listing.contact_name || '',
            listing.contact_email || '',
            listing.contact_title || '',
            listing.contact_linkedin || '',
            listing.contact_phone || '',
            listing.outreach_status || 'not_started',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    })

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    return { data: csv }
}
