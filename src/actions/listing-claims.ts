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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in to claim this listing' }

    const { data, error } = await supabase.rpc('redeem_listing_claim', { p_token: token })

    if (error) {
        console.error('[Claims] Failed to redeem claim:', error)
        return { error: 'Failed to claim listing' }
    }

    if (!data) {
        return { error: 'Claim token is invalid or expired' }
    }

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
                attributes[field] = isEmpty ? null : val
            }
        }
    }

    const { data, error } = await supabase.rpc('update_claimed_listing', {
        p_listing_id: listingId,
        p_description: updates.description || undefined,
        p_contact_name: updates.contact_name || undefined,
        p_contact_email: updates.contact_email || undefined,
        p_contact_title: updates.contact_title || undefined,
        p_contact_linkedin: updates.contact_linkedin || undefined,
        p_contact_phone: updates.contact_phone || undefined,
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
