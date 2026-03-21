'use server'

/**
 * @file listing-claims.ts — Server actions for the company claim flow.
 *
 * @description Manages claim tokens for marketplace listings. Companies receive
 * a magic link in outreach emails, click it to claim their listing, then can
 * edit their data and add fractional executives.
 *
 * @security Uses SECURITY DEFINER RPCs for claim validation/redemption.
 * Only the claimant can update their listing via update_claimed_listing RPC.
 *
 * @related
 * - DB schema: supabase/migrations/20260225930000_listing_claims.sql
 * - Email template: src/lib/notifications/channels/email.ts (listing_claim)
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/actions/audit'
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit'
import { escapeHtml, sanitizeEmail } from '@/lib/security/sanitize'
import { headers } from 'next/headers'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClaimValidation {
    listing_id: string
    company_name: string
    email: string
    is_valid: boolean
}

export interface ClaimedListing {
    listing_id: string
    title: string
    description: string | null
    attributes: Record<string, unknown> | null
    category: string
    subcategory: string
    verification_tier: string
    contact_name: string | null
    contact_email: string | null
    contact_title: string | null
    contact_linkedin: string | null
    contact_phone: string | null
}

export interface ListingUpdateData {
    description?: string
    contact_name?: string
    contact_email?: string
    contact_title?: string
    contact_linkedin?: string
    contact_phone?: string
    capabilities?: string[]
    certifications?: string[]
    industries?: string[]
    employees?: string
    established?: number
    location?: string
}

export interface ListingPreview {
    title: string
    description: string | null
    category: string
    subcategory: string
    specialties: unknown
    certifications: unknown
    industries: unknown
    city: string | null
    country: string | null
    website_url: string | null
    company_size: string | null
    employee_count_exact: number | null
    founded_year: number | null
    production_capacity: string | null
    lead_time: string | null
    quality_systems: string | null
    contact_name: string | null
    materials: unknown
    key_equipment: unknown
    products: unknown
    process_capabilities: unknown
    email: string
    is_valid: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTING PREVIEW (public claim landing page)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Fetch listing preview data for the claim landing page.
 * Can be called unauthenticated. Side effect: marks token as 'clicked'.
 */
export async function getListingPreviewByToken(
    token: string
): Promise<{ data?: ListingPreview; error?: string }> {
    // SECURITY: Validate token format + length before hitting DB
    if (!token || !/^[a-f0-9]{16,128}$/.test(token)) {
        return { error: 'Invalid claim token' }
    }

    // SECURITY: Rate limit to prevent token enumeration
    const headersList = await headers()
    const ip = getClientIP(headersList)
    const rateLimitError = await checkRateLimit('claimPreview', ip)
    if (rateLimitError) {
        return { error: 'Too many requests. Please try again in a moment.' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_listing_preview_by_claim_token', {
        p_token: token,
    })

    if (error) {
        console.error('[Claims] Failed to get listing preview:', error)
        return { error: 'Failed to load listing preview' }
    }

    if (!data || (data as ListingPreview[]).length === 0) {
        return { error: 'Invalid claim token' }
    }

    return { data: (data as ListingPreview[])[0] }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM TOKEN MANAGEMENT (admin side)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Generate a claim token for a marketplace listing.
 * Called when preparing outreach emails.
 */
export async function generateClaimToken(
    listingId: string,
    email: string
): Promise<{ data?: { token: string }; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // INTENT: Check if a valid token already exists for this listing
    const { data: existing } = await supabase
        .from('listing_claim_tokens')
        .select('token')
        .eq('listing_id', listingId)
        .in('status', ['pending', 'clicked'])
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .single()

    if (existing) {
        return { data: { token: existing.token } }
    }

    // Create new token
    const { data, error } = await supabase
        .from('listing_claim_tokens')
        .insert({
            listing_id: listingId,
            email,
        })
        .select('token')
        .single()

    if (error) {
        console.error('[Claims] Failed to generate claim token:', error)
        return { error: 'Failed to generate claim token' }
    }

    return { data: { token: data.token } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM FLOW (public/external side)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Validate a claim token. Can be called unauthenticated.
 * Returns the company name and whether the token is valid.
 */
export async function validateClaimToken(
    token: string
): Promise<{ data?: ClaimValidation; error?: string }> {
    // SECURITY: Validate token format + length before hitting DB
    if (!token || !/^[a-f0-9]{16,128}$/.test(token)) {
        return { error: 'Invalid claim token' }
    }

    // SECURITY: Rate limit claim token validation to prevent token enumeration
    const headersList = await headers()
    const ip = getClientIP(headersList)
    const rateLimitError = await checkRateLimit('claimValidation', ip)
    if (rateLimitError) {
        return { error: 'Too many requests. Please try again in a moment.' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('validate_listing_claim', { p_token: token })

    if (error) {
        console.error('[Claims] Failed to validate token:', error)
        return { error: 'Failed to validate claim' }
    }

    if (!data || (data as ClaimValidation[]).length === 0) {
        return { error: 'Invalid claim token' }
    }

    const claim = (data as ClaimValidation[])[0]
    return { data: claim }
}

/**
 * @description Redeem a claim token. Requires authenticated user.
 * Links the listing to the current user and marks it as claimed.
 */
export async function redeemClaim(
    token: string
): Promise<{ success?: boolean; error?: string }> {
    // SECURITY: Validate token format before any processing
    if (!token || !/^[a-f0-9]{16,128}$/.test(token)) {
        return { error: 'Invalid claim token' }
    }

    // SECURITY: Dedicated rate limit for claim redemption (RT2-03)
    const headersList = await headers()
    const ip = getClientIP(headersList)
    const rateLimitError = await checkRateLimit('claimPreview', ip)
    if (rateLimitError) {
        return { error: 'Too many requests. Please try again in a moment.' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in to claim this listing' }

    // DECISION: Do a lightweight email check directly instead of calling validateClaimToken()
    // which has its own rate limiter — avoids double-consuming rate limit tokens (RT2-01).
    const { data: tokenData, error: tokenError } = await supabase.rpc('validate_listing_claim', {
        p_token: token,
    })

    if (tokenError || !tokenData || (tokenData as ClaimValidation[]).length === 0) {
        return { error: 'This claim link is invalid or has expired' }
    }

    const claim = (tokenData as ClaimValidation[])[0]
    if (!claim.is_valid) {
        return { error: 'This claim link is invalid or has expired' }
    }

    // SECURITY: Verify the authenticated user's email matches the claim token's
    // intended recipient. Prevents claim hijacking if a token URL is leaked.
    if (user.email?.toLowerCase() !== claim.email?.toLowerCase()) {
        const masked = claim.email
            ? `${claim.email[0]}***@${claim.email.split('@')[1] ?? '...'}`
            : 'a different address'
        return { error: `This claim was sent to ${masked}. Please sign in with that email address, or contact us to transfer the claim.` }
    }

    const { data, error } = await supabase.rpc('redeem_listing_claim', { p_token: token })

    if (error) {
        console.error('[Claims] Failed to redeem claim:', error)
        return { error: 'Failed to claim listing' }
    }

    if (!data) {
        return { error: 'Claim token is invalid or expired' }
    }

    // AUDIT: Log listing claim
    logAudit({
        action: 'listing.claimed',
        entityType: 'listing',
        entityId: claim.listing_id,
        metadata: { companyName: claim.company_name },
        userId: user.id,
    })

    revalidatePath('/my-listing')
    return { success: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-EDIT (claimed listing owner)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Get the listing claimed by the current user.
 */
export async function getMyClaimedListing(): Promise<{ data?: ClaimedListing; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase.rpc('get_my_claimed_listing')

    if (error) {
        console.error('[Claims] Failed to get claimed listing:', error)
        return { error: 'Failed to get your listing' }
    }

    if (!data || (data as ClaimedListing[]).length === 0) {
        return { error: 'No claimed listing found' }
    }

    return { data: (data as ClaimedListing[])[0] }
}

/**
 * @description Update a claimed listing. Only the claimant can do this.
 */
export async function updateClaimedListing(
    listingId: string,
    updates: ListingUpdateData
): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // SECURITY: Sanitize all user-provided text fields before DB write (RT2-08)
    const sanitize = (v: string | undefined, maxLen = 500) =>
        v ? escapeHtml(v.trim().slice(0, maxLen)) : undefined
    const sanitizeUrl = (v: string | undefined) => {
        if (!v) return undefined
        const trimmed = v.trim().slice(0, 500)
        // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
        if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return undefined
        return trimmed
    }

    const safeDescription = sanitize(updates.description, 2000)
    const safeContactName = sanitize(updates.contact_name, 100)
    const safeContactEmail = updates.contact_email ? sanitizeEmail(updates.contact_email) || undefined : undefined
    const safeContactTitle = sanitize(updates.contact_title, 100)
    const safeContactLinkedin = sanitizeUrl(updates.contact_linkedin)
    const safeContactPhone = sanitize(updates.contact_phone, 30)

    // INTENT: Merge structured fields into attributes JSONB
    // Use !== undefined so that empty arrays/strings clear the field (set to null)
    // while undefined means "not touched" and preserves the old value.
    let attributes: Record<string, unknown> | undefined
    const attrFields = ['capabilities', 'certifications', 'industries', 'employees', 'established', 'location'] as const
    const hasAttrUpdate = attrFields.some(f => updates[f] !== undefined)

    if (hasAttrUpdate) {
        // Fetch current attributes first
        const { data: current } = await supabase.rpc('get_my_claimed_listing')
        const currentAttrs = ((current as ClaimedListing[])?.[0]?.attributes || {}) as Record<string, unknown>

        attributes = { ...currentAttrs }
        for (const field of attrFields) {
            if (updates[field] !== undefined) {
                const val = updates[field]
                // Empty array or empty string → null (clear); otherwise set the value
                const isEmpty = Array.isArray(val) ? val.length === 0 : val === ''
                // SECURITY: Sanitize array string entries + scalar values
                if (Array.isArray(val) && !isEmpty) {
                    attributes[field] = val.map(v => typeof v === 'string' ? escapeHtml(v.trim().slice(0, 200)) : v)
                } else {
                    attributes[field] = isEmpty ? null : (typeof val === 'string' ? escapeHtml(val.trim().slice(0, 200)) : val)
                }
            }
        }
    }

    const { data, error } = await supabase.rpc('update_claimed_listing', {
        p_listing_id: listingId,
        p_description: safeDescription,
        p_contact_name: safeContactName,
        p_contact_email: safeContactEmail,
        p_contact_linkedin: safeContactLinkedin,
        p_contact_title: safeContactTitle,
        p_contact_phone: safeContactPhone,
        p_attributes: attributes ? (attributes as unknown as Record<string, never>) : undefined,
    })

    if (error) {
        console.error('[Claims] Failed to update listing:', error)
        return { error: 'Failed to update listing' }
    }

    if (!data) {
        return { error: 'Not authorized to update this listing' }
    }

    revalidatePath('/my-listing')
    return { success: true }
}
