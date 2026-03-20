'use server'

/**
 * @file outreach.ts — Server actions for the cold outreach pipeline.
 *
 * @description Campaign CRUD, Contact CRUD (incl. bulk import), AI email
 * generation via Sal, and Email CRUD. Follows the standard auth → foundry →
 * validate → execute → revalidate pattern.
 *
 * @security Every query filters by foundry_id. RLS as secondary defense.
 *
 * @related
 * - Types: src/types/outreach.ts
 * - Prompt builder: src/lib/outreach/prompt-builder.ts
 * - DB schema: supabase/migrations/20260207100000_outreach_pipeline.sql
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { withRetry } from '@/lib/retry'
import { buildOutreachPrompt, parseSequenceResponse, buildResearchPrompt, parseResearchResponse } from '@/lib/outreach/prompt-builder'
import type {
    Campaign,
    CampaignStatus,
    CampaignTone,
    Contact,
    ContactStatus,
    OutreachEmail,
    OutreachKBEntry,
} from '@/types/outreach'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { withAIGate } from '@/lib/ai/with-ai-gate'

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthContext() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' as const }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'Missing Foundry ID' as const }

    return { supabase, user, foundry_id }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCampaigns(): Promise<{ data?: Campaign[]; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { data: campaigns, error } = await supabase
        .from('outreach_campaigns')
        .select('*')
        .eq('foundry_id', foundry_id)
        .order('updated_at', { ascending: false })

    if (error) {
        console.error('[Outreach] Failed to fetch campaigns:', error)
        return { error: 'Failed to fetch campaigns' }
    }

    // FLOW: Get contact counts per campaign for the card display
    const campaignIds = (campaigns || []).map(c => c.id)
    const contactCounts: Record<string, { total: number; sequenced: number }> = {}

    if (campaignIds.length > 0) {
        const { data: contacts } = await supabase
            .from('outreach_contacts')
            .select('campaign_id, status')
            .eq('foundry_id', foundry_id)
            .in('campaign_id', campaignIds)

        if (contacts) {
            for (const c of contacts) {
                if (!c.campaign_id) continue
                if (!contactCounts[c.campaign_id]) {
                    contactCounts[c.campaign_id] = { total: 0, sequenced: 0 }
                }
                contactCounts[c.campaign_id].total += 1
                if (['sequenced', 'contacted', 'replied'].includes(c.status)) {
                    contactCounts[c.campaign_id].sequenced += 1
                }
            }
        }
    }

    const enriched: Campaign[] = (campaigns || []).map(c => ({
        ...c,
        value_props: c.value_props as string[],
        case_studies: c.case_studies as string[],
        metadata: c.metadata as Record<string, unknown>,
        contact_count: contactCounts[c.id]?.total ?? 0,
        sequenced_count: contactCounts[c.id]?.sequenced ?? 0,
    }))

    return { data: enriched }
}

export async function getCampaign(campaignId: string): Promise<{ data?: Campaign; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { data, error } = await supabase
        .from('outreach_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('foundry_id', foundry_id)
        .single()

    if (error || !data) return { error: 'Campaign not found' }

    // Get contact counts
    const { data: contacts } = await supabase
        .from('outreach_contacts')
        .select('status')
        .eq('campaign_id', campaignId)
        .eq('foundry_id', foundry_id)

    const total = contacts?.length ?? 0
    const sequenced = contacts?.filter(c => ['sequenced', 'contacted', 'replied'].includes(c.status)).length ?? 0

    return {
        data: {
            ...data,
            value_props: data.value_props as string[],
            case_studies: data.case_studies as string[],
            metadata: data.metadata as Record<string, unknown>,
            contact_count: total,
            sequenced_count: sequenced,
        }
    }
}

export async function createCampaign(input: {
    name: string
    tone?: CampaignTone
    product_context?: string
    icp_description?: string
    value_props?: string[]
    sequence_length?: number
}): Promise<{ data?: { id: string }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, foundry_id } = ctx

    if (!input.name?.trim()) return { error: 'Campaign name is required' }

    const { data, error } = await supabase
        .from('outreach_campaigns')
        .insert({
            foundry_id,
            created_by: user.id,
            name: input.name.trim(),
            tone: input.tone || 'professional',
            product_context: input.product_context || '',
            icp_description: input.icp_description || '',
            value_props: input.value_props || [],
            sequence_length: input.sequence_length || 4,
        })
        .select('id')
        .single()

    if (error) {
        console.error('[Outreach] Failed to create campaign:', error)
        return { error: 'Failed to create campaign' }
    }

    revalidatePath('/outreach')
    return { data: { id: data.id } }
}

export async function updateCampaign(
    campaignId: string,
    updates: Partial<Pick<Campaign, 'name' | 'status' | 'product_context' | 'icp_description' | 'value_props' | 'case_studies' | 'tone' | 'sequence_length' | 'metadata'>>
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    // GOTCHA: Supabase expects Json type for JSONB columns, cast for compatibility
    const dbUpdates: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }

    const { error } = await supabase
        .from('outreach_campaigns')
        .update(dbUpdates as never)
        .eq('id', campaignId)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to update campaign:', error)
        return { error: 'Failed to update campaign' }
    }

    revalidatePath('/outreach')
    revalidatePath(`/outreach/${campaignId}`)
    return { success: true }
}

export async function deleteCampaign(campaignId: string): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { error } = await supabase
        .from('outreach_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to delete campaign:', error)
        return { error: 'Failed to delete campaign' }
    }

    revalidatePath('/outreach')
    return { success: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function getContacts(campaignId: string): Promise<{ data?: Contact[]; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { data, error } = await supabase
        .from('outreach_contacts')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('foundry_id', foundry_id)
        .order('score', { ascending: false })

    if (error) {
        console.error('[Outreach] Failed to fetch contacts:', error)
        return { error: 'Failed to fetch contacts' }
    }

    return {
        data: (data || []).map(c => ({
            ...c,
            tech_stack: c.tech_stack as string[],
            signals: c.signals as string[],
            pain_points: c.pain_points as string[],
        })),
    }
}

export async function addContact(
    campaignId: string,
    input: {
        first_name: string
        last_name: string
        email?: string
        company_name: string
        job_title?: string
        linkedin_url?: string
        company_domain?: string
        industry?: string
        company_size?: string
    }
): Promise<{ data?: { id: string }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, foundry_id } = ctx

    if (!input.first_name?.trim()) return { error: 'First name is required' }
    if (!input.company_name?.trim()) return { error: 'Company name is required' }

    const { data, error } = await supabase
        .from('outreach_contacts')
        .insert({
            foundry_id,
            campaign_id: campaignId,
            created_by: user.id,
            first_name: input.first_name.trim(),
            last_name: (input.last_name || '').trim(),
            email: (input.email || '').trim(),
            company_name: input.company_name.trim(),
            job_title: (input.job_title || '').trim(),
            linkedin_url: (input.linkedin_url || '').trim(),
            company_domain: (input.company_domain || '').trim(),
            industry: (input.industry || '').trim(),
            company_size: (input.company_size || '').trim(),
        })
        .select('id')
        .single()

    if (error) {
        console.error('[Outreach] Failed to add contact:', error)
        return { error: 'Failed to add contact' }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { data: { id: data.id } }
}

export async function importContacts(
    campaignId: string,
    contacts: Array<{
        first_name: string
        last_name?: string
        email?: string
        company_name: string
        job_title?: string
        linkedin_url?: string
        company_domain?: string
        industry?: string
        company_size?: string
    }>
): Promise<{ data?: { imported: number }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, foundry_id } = ctx

    if (!contacts.length) return { error: 'No contacts to import' }

    const rows = contacts
        .filter(c => c.first_name?.trim() && c.company_name?.trim())
        .map(c => ({
            foundry_id,
            campaign_id: campaignId,
            created_by: user.id,
            first_name: c.first_name.trim(),
            last_name: (c.last_name || '').trim(),
            email: (c.email || '').trim(),
            company_name: c.company_name.trim(),
            job_title: (c.job_title || '').trim(),
            linkedin_url: (c.linkedin_url || '').trim(),
            company_domain: (c.company_domain || '').trim(),
            industry: (c.industry || '').trim(),
            company_size: (c.company_size || '').trim(),
        }))

    if (!rows.length) return { error: 'No valid contacts found (first name and company required)' }

    const { error } = await supabase
        .from('outreach_contacts')
        .insert(rows)

    if (error) {
        console.error('[Outreach] Failed to import contacts:', error)
        return { error: 'Failed to import contacts' }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { data: { imported: rows.length } }
}

/**
 * @description Import enriched marketplace listings as outreach contacts.
 * Bridges the enrichment workflow into the campaign pipeline.
 *
 * @param campaignId - Target campaign
 * @param listingIds - marketplace_listings UUIDs to import
 */
export async function importListingsAsContacts(
    campaignId: string,
    listingIds: string[]
): Promise<{ data?: { imported: number; skipped: number }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, foundry_id } = ctx

    if (!listingIds.length) return { error: 'No listings selected' }

    // FLOW: Fetch listing data for the selected IDs (only those with emails)
    const { data: listings, error: fetchError } = await supabase
        .from('marketplace_listings')
        .select('id, title, description, category, subcategory, attributes, contact_name, contact_email, contact_title, contact_linkedin')
        .in('id', listingIds)
        .not('contact_email', 'is', null)

    if (fetchError) {
        console.error('[Outreach] Failed to fetch listings for import:', fetchError)
        return { error: 'Failed to fetch listings' }
    }

    if (!listings || listings.length === 0) {
        return { error: 'No listings with contact emails found' }
    }

    // INTENT: Check for duplicate emails already in this campaign
    const emails = listings.map(l => l.contact_email!).filter(Boolean)
    const { data: existingContacts } = await supabase
        .from('outreach_contacts')
        .select('email')
        .eq('campaign_id', campaignId)
        .eq('foundry_id', foundry_id)
        .in('email', emails)

    const existingEmails = new Set((existingContacts || []).map(c => c.email).filter(Boolean))

    // INTENT: Map listings to outreach_contact rows
    const rows = listings
        .filter(l => l.contact_email && !existingEmails.has(l.contact_email))
        .map(l => {
            const attrs = (l.attributes || {}) as Record<string, unknown>
            const nameParts = (l.contact_name || '').trim().split(/\s+/)
            const firstName = nameParts[0] || l.title
            const lastName = nameParts.slice(1).join(' ')

            // INTENT: Extract domain from website URL
            let domain = ''
            try {
                const url = attrs.website_url as string
                if (url) domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '')
            } catch {
                // skip
            }

            return {
                foundry_id,
                campaign_id: campaignId,
                created_by: user.id,
                first_name: firstName,
                last_name: lastName,
                email: l.contact_email!,
                company_name: l.title,
                job_title: l.contact_title || '',
                linkedin_url: l.contact_linkedin || '',
                company_domain: domain,
                industry: Array.isArray(attrs.industries) ? (attrs.industries as string[])[0] || '' : '',
                company_size: (attrs.employees as string) || '',
                source_listing_id: l.id,
            }
        })

    const skipped = listings.length - rows.length

    if (rows.length === 0) {
        return { data: { imported: 0, skipped }, error: skipped > 0 ? `All ${skipped} contacts already exist in this campaign` : undefined }
    }

    // INTENT: Batch insert contacts
    const { data: insertedContacts, error: insertError } = await supabase
        .from('outreach_contacts')
        .insert(rows)
        .select('id, source_listing_id')

    if (insertError) {
        console.error('[Outreach] Failed to import listing contacts:', insertError)
        return { error: 'Failed to import contacts' }
    }

    // FLOW: Update marketplace_listings outreach_status to 'imported' and link contact IDs
    if (insertedContacts) {
        for (const contact of insertedContacts) {
            if (contact.source_listing_id) {
                await supabase
                    .from('marketplace_listings')
                    .update({
                        outreach_status: 'imported',
                        outreach_contact_id: contact.id,
                    })
                    .eq('id', contact.source_listing_id)
            }
        }
    }

    revalidatePath(`/outreach/${campaignId}`)
    revalidatePath('/outreach/enrichment')
    return { data: { imported: rows.length, skipped } }
}

export async function updateContactStatus(
    contactIds: string[],
    status: ContactStatus
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    if (!contactIds.length) return { error: 'No contacts selected' }

    const { error } = await supabase
        .from('outreach_contacts')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', contactIds)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to update contact status:', error)
        return { error: 'Failed to update contact status' }
    }

    revalidatePath('/outreach')
    return { success: true }
}

export async function deleteContacts(
    contactIds: string[],
    campaignId: string
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    if (!contactIds.length) return { error: 'No contacts selected' }

    const { error } = await supabase
        .from('outreach_contacts')
        .delete()
        .in('id', contactIds)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to delete contacts:', error)
        return { error: 'Failed to delete contacts' }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { success: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calls Claude for any outreach AI task (research, email generation, etc.).
 */
async function callClaude(
    systemPrompt: string,
    userPrompt: string,
): Promise<{ text: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

    return withRetry(async () => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-6",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
            }),
            signal: AbortSignal.timeout(120_000),
        })

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`)
        }

        const data = await response.json()
        return { text: data.content?.[0]?.text ?? "" }
    }, {
        maxRetries: 2,
        baseDelay: 2000,
        shouldRetry: (error) => {
            const msg = error.message.toLowerCase()
            return msg.includes('429') || msg.includes('502') || msg.includes('503') ||
                msg.includes('network') || msg.includes('timeout') || msg.includes('529')
        },
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT RESEARCH
// ═══════════════════════════════════════════════════════════════════════════════

export async function researchContact(
    campaignId: string,
    contactId: string,
): Promise<{ success?: boolean; error?: string }> {
    return withAIGate('outreach', async ({ supabase, user, foundryId: foundry_id }) => {

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiOutreach', user.id)
    if (rateLimitError) return { error: rateLimitError }

    // Fetch campaign and contact
    const [campaignRes, contactRes] = await Promise.all([
        supabase.from('outreach_campaigns').select('*').eq('id', campaignId).eq('foundry_id', foundry_id).single(),
        supabase.from('outreach_contacts').select('*').eq('id', contactId).eq('foundry_id', foundry_id).single(),
    ])

    if (campaignRes.error || !campaignRes.data) return { error: 'Campaign not found' }
    if (contactRes.error || !contactRes.data) return { error: 'Contact not found' }

    const campaign: Campaign = {
        ...campaignRes.data,
        value_props: campaignRes.data.value_props as string[],
        case_studies: campaignRes.data.case_studies as string[],
        metadata: campaignRes.data.metadata as Record<string, unknown>,
    }

    const contact: Contact = {
        ...contactRes.data,
        tech_stack: contactRes.data.tech_stack as string[],
        signals: contactRes.data.signals as string[],
        pain_points: contactRes.data.pain_points as string[],
    }

    const { systemPrompt, userPrompt } = buildResearchPrompt(contact, campaign)

    let aiText: string
    try {
        const result = await callClaude(systemPrompt, userPrompt)
        aiText = result.text
    } catch (err) {
        console.error('[Outreach] Research failed:', err)
        return { error: 'Failed to research contact. Please try again.' }
    }

    let research
    try {
        research = parseResearchResponse(aiText)
    } catch (err) {
        console.error('[Outreach] Failed to parse research response:', err, aiText.slice(0, 500))
        return { error: 'Failed to parse research data. Please try again.' }
    }

    // Update contact with research data
    const { error: updateError } = await supabase
        .from('outreach_contacts')
        .update({
            research_brief: research.research_brief,
            pain_points: research.pain_points,
            signals: research.signals,
            tech_stack: research.tech_stack,
            recommended_angle: research.recommended_angle,
            score: research.score,
            score_reasoning: research.score_reasoning,
            status: 'researched',
            updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .eq('foundry_id', foundry_id)

    if (updateError) {
        console.error('[Outreach] Failed to save research:', updateError)
        return { error: 'Researched contact but failed to save results' }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { success: true }
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI EMAIL GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateSequenceForContact(
    campaignId: string,
    contactId: string,
): Promise<{ success?: boolean; emailCount?: number; error?: string }> {
    return withAIGate('outreach', async ({ supabase, user, foundryId: foundry_id }) => {

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiOutreach', user.id)
    if (rateLimitError) return { error: rateLimitError }

    // Fetch campaign, contact, and knowledge base in parallel
    const [campaignRes, contactRes, kbRes] = await Promise.all([
        supabase.from('outreach_campaigns').select('*').eq('id', campaignId).eq('foundry_id', foundry_id).single(),
        supabase.from('outreach_contacts').select('*').eq('id', contactId).eq('foundry_id', foundry_id).single(),
        supabase.from('outreach_knowledge_base').select('*').eq('foundry_id', foundry_id).limit(20),
    ])

    if (campaignRes.error || !campaignRes.data) return { error: 'Campaign not found' }
    if (contactRes.error || !contactRes.data) return { error: 'Contact not found' }

    const campaign: Campaign = {
        ...campaignRes.data,
        value_props: campaignRes.data.value_props as string[],
        case_studies: campaignRes.data.case_studies as string[],
        metadata: campaignRes.data.metadata as Record<string, unknown>,
    }

    const contact: Contact = {
        ...contactRes.data,
        tech_stack: contactRes.data.tech_stack as string[],
        signals: contactRes.data.signals as string[],
        pain_points: contactRes.data.pain_points as string[],
    }

    const knowledgeBase: OutreachKBEntry[] = (kbRes.data || []).map(kb => ({
        ...kb,
        tags: kb.tags as string[],
    }))

    // Build prompt and call AI
    const { systemPrompt, userPrompt } = buildOutreachPrompt({ campaign, contact, knowledgeBase })

    let aiText: string
    try {
        const result = await callClaude(systemPrompt, userPrompt)
        aiText = result.text
    } catch (err) {
        console.error('[Outreach] AI generation failed:', err)
        return { error: 'Failed to generate email sequence. Please try again.' }
    }

    // Parse the AI response into emails
    let parsedEmails
    try {
        parsedEmails = parseSequenceResponse(aiText)
    } catch (err) {
        console.error('[Outreach] Failed to parse AI response:', err, aiText.slice(0, 500))
        return { error: 'Failed to parse generated emails. Please try again.' }
    }

    // Delete existing emails for this contact (regeneration)
    const { error: deleteError } = await supabase
        .from('outreach_emails')
        .delete()
        .eq('contact_id', contactId)
        .eq('foundry_id', foundry_id)

    if (deleteError) {
        console.error('[Outreach] Failed to delete old emails:', deleteError)
        return { error: 'Failed to clear old emails before regeneration' }
    }

    // Insert new emails
    const emailRows = parsedEmails.map(email => ({
        foundry_id,
        contact_id: contactId,
        campaign_id: campaignId,
        created_by: user.id,
        sequence_position: email.sequence_position,
        sequence_label: email.sequence_label,
        subject: email.subject,
        subject_variants: email.subject_variants,
        body: email.body,
        send_delay_days: email.send_delay_days,
        status: 'draft' as const,
    }))

    const { error: insertError } = await supabase
        .from('outreach_emails')
        .insert(emailRows)

    if (insertError) {
        console.error('[Outreach] Failed to insert emails:', insertError)
        return { error: 'Generated emails but failed to save them' }
    }

    // Update contact status to sequenced
    await supabase
        .from('outreach_contacts')
        .update({ status: 'sequenced', updated_at: new Date().toISOString() })
        .eq('id', contactId)
        .eq('foundry_id', foundry_id)

    revalidatePath(`/outreach/${campaignId}`)
    return { success: true, emailCount: parsedEmails.length }
    })
}

export async function generateSequencesForBatch(
    campaignId: string,
    contactIds: string[],
): Promise<{ success?: boolean; total?: number; generated?: number; errors?: number; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }

    if (!contactIds.length) return { error: 'No contacts selected' }

    let generated = 0
    let errors = 0

    // DECISION: Generate sequentially to avoid hammering the API. Could be
    // parallelized with rate limiting in the future.
    for (const contactId of contactIds) {
        const result = await generateSequenceForContact(campaignId, contactId)
        if (result.success) {
            generated += 1
        } else {
            errors += 1
        }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { success: true, total: contactIds.length, generated, errors }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function getEmails(campaignId: string): Promise<{ data?: OutreachEmail[]; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { data, error } = await supabase
        .from('outreach_emails')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('foundry_id', foundry_id)
        .order('contact_id')
        .order('sequence_position', { ascending: true })

    if (error) {
        console.error('[Outreach] Failed to fetch emails:', error)
        return { error: 'Failed to fetch emails' }
    }

    return {
        data: (data || []).map(e => ({
            ...e,
            subject_variants: e.subject_variants as string[],
            personalization_data: e.personalization_data as Record<string, unknown>,
            qa_report: e.qa_report as Record<string, unknown> | null,
        })),
    }
}

export async function updateEmail(
    emailId: string,
    updates: Partial<Pick<OutreachEmail, 'subject' | 'body' | 'status' | 'subject_variants'>>
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const dbUpdates: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }

    const { error } = await supabase
        .from('outreach_emails')
        .update(dbUpdates as never)
        .eq('id', emailId)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to update email:', error)
        return { error: 'Failed to update email' }
    }

    revalidatePath('/outreach')
    return { success: true }
}

export async function approveEmails(
    emailIds: string[]
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    if (!emailIds.length) return { error: 'No emails selected' }

    const { error } = await supabase
        .from('outreach_emails')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .in('id', emailIds)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to approve emails:', error)
        return { error: 'Failed to approve emails' }
    }

    revalidatePath('/outreach')
    return { success: true }
}

export async function deleteEmails(
    emailIds: string[],
    campaignId: string
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    if (!emailIds.length) return { error: 'No emails selected' }

    const { error } = await supabase
        .from('outreach_emails')
        .delete()
        .in('id', emailIds)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to delete emails:', error)
        return { error: 'Failed to delete emails' }
    }

    revalidatePath(`/outreach/${campaignId}`)
    return { success: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function getKnowledgeBase(): Promise<{ data?: OutreachKBEntry[]; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { data, error } = await supabase
        .from('outreach_knowledge_base')
        .select('*')
        .eq('foundry_id', foundry_id)
        .order('updated_at', { ascending: false })

    if (error) {
        console.error('[Outreach] Failed to fetch knowledge base:', error)
        return { error: 'Failed to fetch knowledge base' }
    }

    return {
        data: (data || []).map(kb => ({
            ...kb,
            tags: kb.tags as string[],
        })),
    }
}

export async function addKnowledgeEntry(input: {
    title: string
    content: string
    category: string
}): Promise<{ data?: { id: string }; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, foundry_id } = ctx

    if (!input.title?.trim()) return { error: 'Title is required' }
    if (!input.content?.trim()) return { error: 'Content is required' }

    const { data, error } = await supabase
        .from('outreach_knowledge_base')
        .insert({
            foundry_id,
            created_by: user.id,
            title: input.title.trim(),
            content: input.content.trim(),
            content_type: 'text',
            category: input.category || 'product',
            tags: [],
        })
        .select('id')
        .single()

    if (error) {
        console.error('[Outreach] Failed to add knowledge entry:', error)
        return { error: 'Failed to add knowledge entry' }
    }

    revalidatePath('/outreach')
    return { data: { id: data.id } }
}

export async function updateKnowledgeEntry(
    entryId: string,
    updates: Partial<Pick<OutreachKBEntry, 'title' | 'content' | 'category'>>
): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { error } = await supabase
        .from('outreach_knowledge_base')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to update knowledge entry:', error)
        return { error: 'Failed to update knowledge entry' }
    }

    revalidatePath('/outreach')
    return { success: true }
}

export async function deleteKnowledgeEntry(entryId: string): Promise<{ success?: boolean; error?: string }> {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, foundry_id } = ctx

    const { error } = await supabase
        .from('outreach_knowledge_base')
        .delete()
        .eq('id', entryId)
        .eq('foundry_id', foundry_id)

    if (error) {
        console.error('[Outreach] Failed to delete knowledge entry:', error)
        return { error: 'Failed to delete knowledge entry' }
    }

    revalidatePath('/outreach')
    return { success: true }
}
