'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/types/database.types'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function repairListingLink(supabase: any, providerId: string, listingId: string) {
    // Repair both directions so ownership checks and future lookups work
    await Promise.allSettled([
        supabase
            .from('provider_profiles')
            .update({ listing_id: listingId })
            .eq('id', providerId),
        supabase
            .from('marketplace_listings')
            .update({ created_by_provider_id: providerId })
            .eq('id', listingId),
    ])
}

export interface SelfServiceListingInput {
    title: string
    category: 'People' | 'Products' | 'Services'
    subcategory: string
    description: string
    attributes?: Record<string, unknown>
}

// Create a self-service listing
export async function createSelfServiceListing(input: SelfServiceListingInput) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id, tier')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { success: false, error: 'Provider profile not found. Please apply first.' }
    
    // Only approved providers can create listings
    if (provider.tier === 'pending' || provider.tier === 'suspended') {
        return { success: false, error: 'Your provider account must be approved before creating listings.' }
    }

    // GOTCHA: Check if this provider already has a listing (orphaned from a previous
    // attempt where listing_id FK wasn't set, or pushed via Nightshift).
    // Without this guard, the INSERT succeeds but creates duplicates.
    const { data: existingListing } = await supabase
        .from('marketplace_listings')
        .select('id')
        .eq('created_by_provider_id', provider.id)
        .limit(1)
        .maybeSingle()

    if (existingListing) {
        await repairListingLink(supabase, provider.id, existingListing.id)
        return { success: false, error: 'You already have a listing. Please refresh the page to edit it.' }
    }

    // Create the listing with pending approval status
    const { data: listing, error: listingError } = await supabase
        .from('marketplace_listings')
        .insert({
            title: input.title,
            category: input.category as 'People' | 'Products' | 'Services',
            subcategory: input.subcategory,
            description: input.description,
            attributes: (input.attributes || {}) as unknown as Json,
            created_by_provider_id: provider.id,
            is_self_created: true,
            approval_status: 'pending',
            is_verified: false
        })
        .select()
        .single()
    
    if (listingError) return { success: false, error: sanitizeErrorMessage(listingError) }
    
    // Link the listing to the provider profile
    const { error: linkError } = await supabase
        .from('provider_profiles')
        .update({ listing_id: listing.id })
        .eq('id', provider.id)
    
    if (linkError) {
        // Rollback listing creation
        await supabase.from('marketplace_listings').delete().eq('id', listing.id)
        return { success: false, error: sanitizeErrorMessage(linkError) }
    }
    
    revalidatePath('/provider-portal')
    revalidatePath('/marketplace')
    return { success: true, listingId: listing.id, error: null }
}

// Update a self-service listing
export async function updateSelfServiceListing(listingId: string, input: Partial<SelfServiceListingInput>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify ownership: check that the user's provider_profiles.listing_id matches,
    // OR that created_by_provider_id points to their provider profile.
    // The !inner join fails when created_by_provider_id is NULL (Nightshift listings).
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id, listing_id')
        .eq('user_id', user.id)
        .single()

    if (!provider) return { success: false, error: 'Provider profile not found' }

    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('id, created_by_provider_id')
        .eq('id', listingId)
        .single()

    if (!listing) return { success: false, error: 'Listing not found' }

    const ownsViaFK = provider.listing_id === listingId
    const ownsViaProvider = listing.created_by_provider_id === provider.id
    if (!ownsViaFK && !ownsViaProvider) {
        return { success: false, error: 'Not authorized to edit this listing' }
    }
    
    // SECURITY: Allowlist fields — prevent mass assignment of is_verified, approval_status, etc.
    const updateData: Record<string, unknown> = {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.subcategory !== undefined && { subcategory: input.subcategory }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.attributes !== undefined && { attributes: input.attributes }),
        approval_status: 'pending' // Require re-approval after edit
    }
    const { error } = await supabase
        .from('marketplace_listings')
        .update(updateData)
        .eq('id', listingId)
    
    if (error) return { success: false, error: sanitizeErrorMessage(error) }
    
    revalidatePath('/provider-portal')
    revalidatePath('/marketplace')
    return { success: true, error: null }
}

// Get provider's listing
export async function getProviderListing() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { listing: null, error: 'Not authenticated' }

    // Get provider profile with listing via FK
    const { data: provider, error: providerError } = await supabase
        .from('provider_profiles')
        .select(`
            id,
            listing_id,
            marketplace_listings (
                id,
                title,
                category,
                subcategory,
                description,
                attributes,
                is_verified,
                approval_status,
                approval_notes,
                created_at
            )
        `)
        .eq('user_id', user.id)
        .single()

    if (providerError) return { listing: null, error: sanitizeErrorMessage(providerError) }

    // If FK join found the listing, return it
    if (provider?.marketplace_listings) {
        return { listing: provider.marketplace_listings, error: null }
    }

    // GOTCHA: listing_id FK may not be set even though a listing exists for this
    // provider. Two fallback paths:
    //   1. created_by_provider_id — set by self-service create
    //   2. listing_claim_tokens — set by Nightshift claim flow
    if (provider?.id) {
        // Fallback 1: Search by created_by_provider_id
        const { data: orphanedListing } = await supabase
            .from('marketplace_listings')
            .select('id, title, category, subcategory, description, attributes, is_verified, approval_status, approval_notes, created_at')
            .eq('created_by_provider_id', provider.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (orphanedListing) {
            await repairListingLink(supabase, provider.id, orphanedListing.id)
            return { listing: orphanedListing, error: null }
        }

        // Fallback 2: Search via claim tokens (Nightshift-pushed listings
        // don't have created_by_provider_id set — only claim_tokens link them)
        const { data: claimedListing } = await supabase
            .rpc('get_my_claimed_listing')

        if (claimedListing && (claimedListing as Record<string, unknown>[]).length > 0) {
            const claimed = (claimedListing as Record<string, unknown>[])[0]
            const listingId = claimed.listing_id as string

            // Fetch full listing data for the page
            const { data: fullListing } = await supabase
                .from('marketplace_listings')
                .select('id, title, category, subcategory, description, attributes, is_verified, approval_status, approval_notes, created_at')
                .eq('id', listingId)
                .single()

            if (fullListing) {
                await repairListingLink(supabase, provider.id, fullListing.id)
                return { listing: fullListing, error: null }
            }
        }
    }

    return { listing: null, error: null }
}

// Get all subcategories for a category
export async function getSubcategories(category: string) {
    const subcategories: Record<string, string[]> = {
        'People': [
            'Executive Leadership',
            'Finance & Accounting',
            'Marketing & Growth',
            'Sales & Business Development',
            'Operations & Strategy',
            'Product & Technology',
            'Human Resources',
            'Legal & Compliance',
            'Design & Creative',
            'Engineering',
            'Data & Analytics',
            'Customer Success',
            'Other'
        ],
        'Products': [
            'Hardware Components',
            'Manufacturing Equipment',
            'Software Licenses',
            'Office Equipment',
            'Raw Materials',
            'Prototyping',
            'Packaging',
            'Other'
        ],
        'Services': [
            'Legal Services',
            'Accounting Services',
            'Manufacturing',
            'Logistics & Fulfillment',
            'Marketing Services',
            'Consulting',
            'Research & Development',
            'Quality Assurance',
            'Training & Development',
            'Other'
        ],
    }
    
    return subcategories[category] || []
}

// Preview listing as it would appear
export async function previewListing(input: SelfServiceListingInput) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { preview: null, error: 'Not authenticated' }
    
    // Get provider profile for additional data
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select(`
            *,
            profiles!provider_profiles_user_id_fkey (
                full_name,
                avatar_url
            ),
            provider_ratings (
                average_rating,
                total_reviews
            )
        `)
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { preview: null, error: 'Provider profile not found' }
    
    const profiles = provider.profiles as { full_name: string | null; avatar_url: string | null } | null
    const ratings = provider.provider_ratings as { average_rating: number | null; total_reviews: number } | null
    
    // Build preview object matching marketplace card format
    const preview = {
        id: 'preview',
        title: input.title,
        category: input.category,
        subcategory: input.subcategory,
        description: input.description,
        attributes: input.attributes || {},
        is_verified: false,
        provider: {
            name: profiles?.full_name || 'Your Name',
            avatar: profiles?.avatar_url,
            headline: provider.headline,
            day_rate: provider.day_rate,
            currency: provider.currency,
            tier: provider.tier,
            average_rating: ratings?.average_rating,
            total_reviews: ratings?.total_reviews || 0
        }
    }
    
    return { preview, error: null }
}

// Submit listing for approval
export async function submitListingForApproval(listingId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify ownership via provider profile (works even when created_by_provider_id is NULL)
    const { data: approvalProvider } = await supabase
        .from('provider_profiles')
        .select('id, listing_id')
        .eq('user_id', user.id)
        .single()

    if (!approvalProvider) return { success: false, error: 'Provider profile not found' }

    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('id, created_by_provider_id, approval_status')
        .eq('id', listingId)
        .single()

    if (!listing) return { success: false, error: 'Listing not found' }

    const ownsListing = approvalProvider.listing_id === listingId || listing.created_by_provider_id === approvalProvider.id
    if (!ownsListing) {
        return { success: false, error: 'Not authorized' }
    }
    
    if (listing.approval_status === 'approved') {
        return { success: false, error: 'Listing is already approved' }
    }
    
    if (listing.approval_status === 'pending') {
        return { success: false, error: 'Listing is already pending approval' }
    }
    
    const { error } = await supabase
        .from('marketplace_listings')
        .update({ approval_status: 'pending' })
        .eq('id', listingId)
    
    if (error) return { success: false, error: sanitizeErrorMessage(error) }
    
    revalidatePath('/provider-portal')
    return { success: true, error: null }
}
