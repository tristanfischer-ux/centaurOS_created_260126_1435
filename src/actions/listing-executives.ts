'use server'

/**
 * @file listing-executives.ts — Server actions for managing fractional
 * executives linked to claimed marketplace listings.
 *
 * @description Claimed listing owners can add, update, and remove executives
 * showcasing their available fractional talent. Uses SECURITY DEFINER RPCs
 * to enforce ownership checks.
 *
 * @related
 * - DB schema: supabase/migrations/20260225940000_listing_executives.sql
 * - Claim flow: src/actions/listing-claims.ts
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ListingExecutive {
    id: string
    listing_id: string
    full_name: string
    title: string | null
    email: string | null
    linkedin_url: string | null
    bio: string | null
    specializations: string[]
    availability: string
    provider_profile_id: string | null
    status: string
    created_at: string
}

export interface PublicExecutive {
    id: string
    full_name: string
    title: string | null
    bio: string | null
    linkedin_url: string | null
    specializations: string[]
    availability: string
    provider_profile_id: string | null
}

export interface AddExecutiveData {
    full_name: string
    title?: string
    email?: string
    linkedin_url?: string
    bio?: string
    specializations?: string[]
    availability?: 'full_time' | 'part_time' | 'advisory' | 'project_based'
}

export interface UpdateExecutiveData {
    full_name?: string
    title?: string
    email?: string
    linkedin_url?: string
    bio?: string
    specializations?: string[]
    availability?: string
    status?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Get executives for a listing (public-safe, only active).
 */
export async function getListingExecutives(
    listingId: string
): Promise<{ data?: PublicExecutive[]; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_listing_executives', {
        p_listing_id: listingId,
    })

    if (error) {
        console.error('[Executives] Failed to get listing executives:', error)
        return { error: 'Failed to load executives' }
    }

    return { data: (data as PublicExecutive[]) ?? [] }
}

/**
 * @description Get executives for the current user's claimed listing.
 * Includes all statuses (not just active) for management purposes.
 */
export async function getMyListingExecutives(): Promise<{
    data?: ListingExecutive[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase.rpc('get_my_listing_executives')

    if (error) {
        console.error('[Executives] Failed to get my executives:', error)
        return { error: 'Failed to load your executives' }
    }

    return { data: (data as ListingExecutive[]) ?? [] }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @description Add a fractional executive to a claimed listing.
 */
export async function addExecutiveToListing(
    listingId: string,
    executive: AddExecutiveData
): Promise<{ data?: { id: string }; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase.rpc('add_listing_executive', {
        p_listing_id: listingId,
        p_full_name: executive.full_name,
        p_title: executive.title,
        p_email: executive.email,
        p_linkedin_url: executive.linkedin_url,
        p_bio: executive.bio,
        p_specializations: executive.specializations ?? [],
        p_availability: executive.availability ?? 'part_time',
    })

    if (error) {
        console.error('[Executives] Failed to add executive:', error)
        return { error: 'Failed to add executive' }
    }

    if (!data) {
        return { error: 'Not authorized to add executives to this listing' }
    }

    revalidatePath('/my-listing')
    return { data: { id: data as string } }
}

/**
 * @description Update a fractional executive's details.
 */
export async function updateExecutive(
    executiveId: string,
    updates: UpdateExecutiveData
): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase.rpc('update_listing_executive', {
        p_exec_id: executiveId,
        p_full_name: updates.full_name,
        p_title: updates.title,
        p_email: updates.email,
        p_linkedin_url: updates.linkedin_url,
        p_bio: updates.bio,
        p_specializations: updates.specializations,
        p_availability: updates.availability,
        p_status: updates.status,
    })

    if (error) {
        console.error('[Executives] Failed to update executive:', error)
        return { error: 'Failed to update executive' }
    }

    if (!data) {
        return { error: 'Not authorized to update this executive' }
    }

    revalidatePath('/my-listing')
    return { success: true }
}

/**
 * @description Soft-delete an executive (marks as 'removed').
 */
export async function removeExecutive(
    executiveId: string
): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase.rpc('remove_listing_executive', {
        p_exec_id: executiveId,
    })

    if (error) {
        console.error('[Executives] Failed to remove executive:', error)
        return { error: 'Failed to remove executive' }
    }

    if (!data) {
        return { error: 'Not authorized to remove this executive' }
    }

    revalidatePath('/my-listing')
    return { success: true }
}
