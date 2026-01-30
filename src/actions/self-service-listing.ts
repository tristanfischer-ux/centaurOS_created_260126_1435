'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface SelfServiceListingInput {
    title: string
    category: 'People' | 'Products' | 'Services' | 'AI'
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
    
    // Create the listing with pending approval status
    const { data: listing, error: listingError } = await supabase
        .from('marketplace_listings')
        .insert({
            title: input.title,
            category: input.category,
            subcategory: input.subcategory,
            description: input.description,
            attributes: input.attributes || {},
            created_by_provider_id: provider.id,
            is_self_created: true,
            approval_status: 'pending',
            is_verified: false
        })
        .select()
        .single()
    
    if (listingError) return { success: false, error: listingError.message }
    
    // Link the listing to the provider profile
    const { error: linkError } = await supabase
        .from('provider_profiles')
        .update({ listing_id: listing.id })
        .eq('id', provider.id)
    
    if (linkError) {
        // Rollback listing creation
        await supabase.from('marketplace_listings').delete().eq('id', listing.id)
        return { success: false, error: linkError.message }
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
    
    // Verify ownership
    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('created_by_provider_id, provider_profiles!inner(user_id)')
        .eq('id', listingId)
        .single()
    
    if (!listing) return { success: false, error: 'Listing not found' }
    
    const providerUserId = (listing.provider_profiles as { user_id: string })?.user_id
    if (providerUserId !== user.id) {
        return { success: false, error: 'Not authorized to edit this listing' }
    }
    
    // Update the listing - resets to pending approval if content changed
    const { error } = await supabase
        .from('marketplace_listings')
        .update({
            ...input,
            approval_status: 'pending', // Require re-approval after edit
            updated_at: new Date().toISOString()
        })
        .eq('id', listingId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal')
    revalidatePath('/marketplace')
    return { success: true, error: null }
}

// Get provider's listing
export async function getProviderListing() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { listing: null, error: 'Not authenticated' }
    
    // Get provider profile with listing
    const { data: provider, error: providerError } = await supabase
        .from('provider_profiles')
        .select(`
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
                created_at,
                updated_at
            )
        `)
        .eq('user_id', user.id)
        .single()
    
    if (providerError) return { listing: null, error: providerError.message }
    
    return { listing: provider?.marketplace_listings || null, error: null }
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
        'AI': [
            'AI Agents',
            'Data Processing',
            'Content Generation',
            'Code Generation',
            'Analytics & Insights',
            'Automation',
            'Integration',
            'Custom AI Solutions',
            'Other'
        ]
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
    
    // Verify ownership
    const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('created_by_provider_id, approval_status, provider_profiles!inner(user_id)')
        .eq('id', listingId)
        .single()
    
    if (!listing) return { success: false, error: 'Listing not found' }
    
    if ((listing.provider_profiles as { user_id: string }).user_id !== user.id) {
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
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal')
    return { success: true, error: null }
}
