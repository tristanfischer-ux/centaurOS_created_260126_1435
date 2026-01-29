"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ==========================================
// TYPES
// ==========================================

export interface PortfolioItem {
    id: string
    provider_id: string
    title: string
    description: string | null
    image_urls: string[]
    project_url: string | null
    client_name: string | null
    completion_date: string | null
    is_featured: boolean
    created_at: string
}

export interface Certification {
    id: string
    provider_id: string
    certification_name: string
    issuing_body: string
    credential_id: string | null
    issued_date: string | null
    expiry_date: string | null
    verification_url: string | null
    is_verified: boolean
    created_at: string
}

export type BadgeType = 
    | 'fast_responder' 
    | 'top_rated' 
    | 'reliable' 
    | 'verified_partner' 
    | 'rising_star'

export interface ProviderBadge {
    id: string
    provider_id: string
    badge_type: BadgeType
    earned_at: string
}

export interface ProviderProfile {
    id: string
    user_id: string
    listing_id: string | null
    day_rate: number | null
    currency: string
    bio: string | null
    headline: string | null
    tier: string
    is_active: boolean
}

// ==========================================
// HELPER: Get current user's provider profile
// ==========================================

async function getCurrentProviderProfile() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return { profile: null, error: "Not authenticated" }
    }

    const { data: profile, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (error && error.code !== 'PGRST116') {
        return { profile: null, error: error.message }
    }

    return { profile, error: null }
}

// ==========================================
// PORTFOLIO ACTIONS
// ==========================================

/**
 * Get portfolio items for a provider
 */
export async function getPortfolioItems(providerId?: string): Promise<{
    data: PortfolioItem[]
    error: string | null
}> {
    try {
        const supabase = await createClient()

        // If no providerId, get current user's provider profile
        let targetProviderId = providerId
        if (!targetProviderId) {
            const { profile, error } = await getCurrentProviderProfile()
            if (error || !profile) {
                return { data: [], error: error || "No provider profile found" }
            }
            targetProviderId = profile.id
        }

        const { data, error } = await supabase
            .from('provider_portfolio')
            .select('*')
            .eq('provider_id', targetProviderId)
            .order('is_featured', { ascending: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching portfolio:', error)
            return { data: [], error: error.message }
        }

        return { data: data as PortfolioItem[], error: null }
    } catch (err) {
        console.error('Failed to fetch portfolio:', err)
        return { data: [], error: 'Failed to fetch portfolio' }
    }
}

/**
 * Add a new portfolio item
 */
export async function addPortfolioItem(data: {
    title: string
    description?: string
    image_urls?: string[]
    project_url?: string
    client_name?: string
    completion_date?: string
    is_featured?: boolean
}): Promise<{ data: PortfolioItem | null; error: string | null }> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { data: null, error: profileError || "No provider profile found" }
        }

        // Validate required fields
        if (!data.title?.trim()) {
            return { data: null, error: "Title is required" }
        }

        const { data: newItem, error } = await supabase
            .from('provider_portfolio')
            .insert({
                provider_id: profile.id,
                title: data.title.trim(),
                description: data.description?.trim() || null,
                image_urls: data.image_urls || [],
                project_url: data.project_url?.trim() || null,
                client_name: data.client_name?.trim() || null,
                completion_date: data.completion_date || null,
                is_featured: data.is_featured || false,
            })
            .select()
            .single()

        if (error) {
            console.error('Error adding portfolio item:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/provider-portal/portfolio')
        return { data: newItem as PortfolioItem, error: null }
    } catch (err) {
        console.error('Failed to add portfolio item:', err)
        return { data: null, error: 'Failed to add portfolio item' }
    }
}

/**
 * Update a portfolio item
 */
export async function updatePortfolioItem(
    id: string,
    data: {
        title?: string
        description?: string
        image_urls?: string[]
        project_url?: string
        client_name?: string
        completion_date?: string
        is_featured?: boolean
    }
): Promise<{ data: PortfolioItem | null; error: string | null }> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { data: null, error: profileError || "No provider profile found" }
        }

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = {}
        if (data.title !== undefined) updateData.title = data.title.trim()
        if (data.description !== undefined) updateData.description = data.description?.trim() || null
        if (data.image_urls !== undefined) updateData.image_urls = data.image_urls
        if (data.project_url !== undefined) updateData.project_url = data.project_url?.trim() || null
        if (data.client_name !== undefined) updateData.client_name = data.client_name?.trim() || null
        if (data.completion_date !== undefined) updateData.completion_date = data.completion_date || null
        if (data.is_featured !== undefined) updateData.is_featured = data.is_featured

        const { data: updatedItem, error } = await supabase
            .from('provider_portfolio')
            .update(updateData)
            .eq('id', id)
            .eq('provider_id', profile.id) // Ensure ownership
            .select()
            .single()

        if (error) {
            console.error('Error updating portfolio item:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/provider-portal/portfolio')
        return { data: updatedItem as PortfolioItem, error: null }
    } catch (err) {
        console.error('Failed to update portfolio item:', err)
        return { data: null, error: 'Failed to update portfolio item' }
    }
}

/**
 * Delete a portfolio item
 */
export async function deletePortfolioItem(id: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { success: false, error: profileError || "No provider profile found" }
        }

        const { error } = await supabase
            .from('provider_portfolio')
            .delete()
            .eq('id', id)
            .eq('provider_id', profile.id) // Ensure ownership

        if (error) {
            console.error('Error deleting portfolio item:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/portfolio')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete portfolio item:', err)
        return { success: false, error: 'Failed to delete portfolio item' }
    }
}

/**
 * Reorder portfolio items (update sort order)
 */
export async function reorderPortfolioItems(
    itemIds: string[]
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { success: false, error: profileError || "No provider profile found" }
        }

        // For now, use is_featured to control ordering
        // First item is featured, rest are not
        const updates = itemIds.map((id, index) => ({
            id,
            is_featured: index === 0,
        }))

        for (const update of updates) {
            const { error } = await supabase
                .from('provider_portfolio')
                .update({ is_featured: update.is_featured })
                .eq('id', update.id)
                .eq('provider_id', profile.id)

            if (error) {
                console.error('Error reordering portfolio:', error)
                return { success: false, error: error.message }
            }
        }

        revalidatePath('/provider-portal/portfolio')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to reorder portfolio:', err)
        return { success: false, error: 'Failed to reorder portfolio' }
    }
}

// ==========================================
// CERTIFICATIONS ACTIONS
// ==========================================

/**
 * Get certifications for a provider
 */
export async function getCertifications(providerId?: string): Promise<{
    data: Certification[]
    error: string | null
}> {
    try {
        const supabase = await createClient()

        let targetProviderId = providerId
        if (!targetProviderId) {
            const { profile, error } = await getCurrentProviderProfile()
            if (error || !profile) {
                return { data: [], error: error || "No provider profile found" }
            }
            targetProviderId = profile.id
        }

        const { data, error } = await supabase
            .from('provider_certifications')
            .select('*')
            .eq('provider_id', targetProviderId)
            .order('is_verified', { ascending: false })
            .order('issued_date', { ascending: false })

        if (error) {
            console.error('Error fetching certifications:', error)
            return { data: [], error: error.message }
        }

        return { data: data as Certification[], error: null }
    } catch (err) {
        console.error('Failed to fetch certifications:', err)
        return { data: [], error: 'Failed to fetch certifications' }
    }
}

/**
 * Add a new certification
 */
export async function addCertification(data: {
    certification_name: string
    issuing_body: string
    credential_id?: string
    issued_date?: string
    expiry_date?: string
    verification_url?: string
}): Promise<{ data: Certification | null; error: string | null }> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { data: null, error: profileError || "No provider profile found" }
        }

        // Validate required fields
        if (!data.certification_name?.trim()) {
            return { data: null, error: "Certification name is required" }
        }
        if (!data.issuing_body?.trim()) {
            return { data: null, error: "Issuing body is required" }
        }

        const { data: newCert, error } = await supabase
            .from('provider_certifications')
            .insert({
                provider_id: profile.id,
                certification_name: data.certification_name.trim(),
                issuing_body: data.issuing_body.trim(),
                credential_id: data.credential_id?.trim() || null,
                issued_date: data.issued_date || null,
                expiry_date: data.expiry_date || null,
                verification_url: data.verification_url?.trim() || null,
                is_verified: false, // Admin must verify
            })
            .select()
            .single()

        if (error) {
            console.error('Error adding certification:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { data: newCert as Certification, error: null }
    } catch (err) {
        console.error('Failed to add certification:', err)
        return { data: null, error: 'Failed to add certification' }
    }
}

/**
 * Update a certification
 */
export async function updateCertification(
    id: string,
    data: {
        certification_name?: string
        issuing_body?: string
        credential_id?: string
        issued_date?: string
        expiry_date?: string
        verification_url?: string
    }
): Promise<{ data: Certification | null; error: string | null }> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { data: null, error: profileError || "No provider profile found" }
        }

        const updateData: Record<string, unknown> = {}
        if (data.certification_name !== undefined) updateData.certification_name = data.certification_name.trim()
        if (data.issuing_body !== undefined) updateData.issuing_body = data.issuing_body.trim()
        if (data.credential_id !== undefined) updateData.credential_id = data.credential_id?.trim() || null
        if (data.issued_date !== undefined) updateData.issued_date = data.issued_date || null
        if (data.expiry_date !== undefined) updateData.expiry_date = data.expiry_date || null
        if (data.verification_url !== undefined) updateData.verification_url = data.verification_url?.trim() || null

        const { data: updatedCert, error } = await supabase
            .from('provider_certifications')
            .update(updateData)
            .eq('id', id)
            .eq('provider_id', profile.id)
            .select()
            .single()

        if (error) {
            console.error('Error updating certification:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { data: updatedCert as Certification, error: null }
    } catch (err) {
        console.error('Failed to update certification:', err)
        return { data: null, error: 'Failed to update certification' }
    }
}

/**
 * Delete a certification
 */
export async function deleteCertification(id: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        const { profile, error: profileError } = await getCurrentProviderProfile()
        if (profileError || !profile) {
            return { success: false, error: profileError || "No provider profile found" }
        }

        const { error } = await supabase
            .from('provider_certifications')
            .delete()
            .eq('id', id)
            .eq('provider_id', profile.id)

        if (error) {
            console.error('Error deleting certification:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete certification:', err)
        return { success: false, error: 'Failed to delete certification' }
    }
}

// ==========================================
// BADGES ACTIONS
// ==========================================

/**
 * Get badges for a provider
 */
export async function getProviderBadges(providerId?: string): Promise<{
    data: ProviderBadge[]
    error: string | null
}> {
    try {
        const supabase = await createClient()

        let targetProviderId = providerId
        if (!targetProviderId) {
            const { profile, error } = await getCurrentProviderProfile()
            if (error || !profile) {
                return { data: [], error: error || "No provider profile found" }
            }
            targetProviderId = profile.id
        }

        const { data, error } = await supabase
            .from('provider_badges')
            .select('*')
            .eq('provider_id', targetProviderId)
            .order('earned_at', { ascending: false })

        if (error) {
            console.error('Error fetching badges:', error)
            return { data: [], error: error.message }
        }

        return { data: data as ProviderBadge[], error: null }
    } catch (err) {
        console.error('Failed to fetch badges:', err)
        return { data: [], error: 'Failed to fetch badges' }
    }
}

/**
 * Get all trust signals for a provider (portfolio, certifications, badges)
 */
export async function getProviderTrustSignals(providerId: string): Promise<{
    portfolio: PortfolioItem[]
    certifications: Certification[]
    badges: ProviderBadge[]
    error: string | null
}> {
    try {
        const [portfolioResult, certsResult, badgesResult] = await Promise.all([
            getPortfolioItems(providerId),
            getCertifications(providerId),
            getProviderBadges(providerId),
        ])

        return {
            portfolio: portfolioResult.data,
            certifications: certsResult.data,
            badges: badgesResult.data,
            error: portfolioResult.error || certsResult.error || badgesResult.error,
        }
    } catch (err) {
        console.error('Failed to fetch trust signals:', err)
        return {
            portfolio: [],
            certifications: [],
            badges: [],
            error: 'Failed to fetch trust signals',
        }
    }
}

/**
 * Get current user's provider profile
 */
export async function getMyProviderProfile(): Promise<{
    data: ProviderProfile | null
    error: string | null
}> {
    const { profile, error } = await getCurrentProviderProfile()
    return { data: profile as ProviderProfile | null, error }
}
