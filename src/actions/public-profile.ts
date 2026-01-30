'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface PublicProfile {
    id: string
    user_id: string
    username: string | null
    profile_slug: string | null
    headline: string | null
    bio: string | null
    video_url: string | null
    video_thumbnail_url: string | null
    linkedin_url: string | null
    website_url: string | null
    location: string | null
    years_experience: number | null
    day_rate: number | null
    hourly_rate: number | null
    currency: string
    timezone: string
    tier: string
    is_public: boolean
    profile_completeness: number
    profile_views: number
    specializations: string[]
    industries: string[]
    company_stages: string[]
    accepts_trial: boolean
    trial_rate_discount: number
    minimum_engagement_hours: number
    // Joined data
    user_name: string | null
    user_email: string | null
    user_avatar: string | null
    average_rating: number | null
    total_reviews: number
    total_transactions: number
    case_studies: CaseStudy[]
    portfolio_items: PortfolioItem[]
    certifications: Certification[]
    badges: Badge[]
}

export interface CaseStudy {
    id: string
    title: string
    client_name: string | null
    client_logo_url: string | null
    client_industry: string | null
    company_stage: string | null
    challenge: string
    approach: string
    outcome: string
    metrics: { label: string; value: string; change_percent?: number }[]
    testimonial_quote: string | null
    testimonial_author: string | null
    testimonial_role: string | null
    start_date: string | null
    end_date: string | null
    engagement_type: string | null
    hours_per_week: number | null
    is_featured: boolean
}

export interface PortfolioItem {
    id: string
    title: string
    description: string | null
    image_urls: string[]
    project_url: string | null
    client_name: string | null
    completion_date: string | null
    is_featured: boolean
}

export interface Certification {
    id: string
    certification_name: string
    issuing_body: string
    credential_id: string | null
    issued_date: string | null
    expiry_date: string | null
    verification_url: string | null
    is_verified: boolean
}

export interface Badge {
    badge_type: string
    earned_at: string
}

export async function getPublicProfile(slug: string): Promise<{ profile: PublicProfile | null; error: string | null }> {
    const supabase = await createClient()
    
    // First get the provider profile by slug
    const { data: provider, error: providerError } = await supabase
        .from('provider_profiles')
        .select(`
            *,
            profiles!provider_profiles_user_id_fkey (
                id,
                full_name,
                email,
                avatar_url
            ),
            provider_ratings (
                average_rating,
                total_reviews,
                total_transactions
            )
        `)
        .eq('profile_slug', slug)
        .eq('is_public', true)
        .eq('is_active', true)
        .single()
    
    if (providerError || !provider) {
        // Try by username as fallback
        const { data: providerByUsername, error: usernameError } = await supabase
            .from('provider_profiles')
            .select(`
                *,
                profiles!provider_profiles_user_id_fkey (
                    id,
                    full_name,
                    email,
                    avatar_url
                ),
                provider_ratings (
                    average_rating,
                    total_reviews,
                    total_transactions
                )
            `)
            .eq('username', slug)
            .eq('is_public', true)
            .eq('is_active', true)
            .single()
        
        if (usernameError || !providerByUsername) {
            return { profile: null, error: 'Profile not found' }
        }
        
        return buildProfileResponse(supabase, providerByUsername)
    }
    
    return buildProfileResponse(supabase, provider)
}

async function buildProfileResponse(supabase: Awaited<ReturnType<typeof createClient>>, provider: Record<string, unknown>): Promise<{ profile: PublicProfile | null; error: string | null }> {
    const providerId = provider.id as string
    
    // Get case studies
    const { data: caseStudies } = await supabase
        .from('case_studies')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_public', true)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
    
    // Get portfolio items
    const { data: portfolio } = await supabase
        .from('provider_portfolio')
        .select('*')
        .eq('provider_id', providerId)
        .order('is_featured', { ascending: false })
    
    // Get certifications
    const { data: certifications } = await supabase
        .from('provider_certifications')
        .select('*')
        .eq('provider_id', providerId)
        .order('is_verified', { ascending: false })
    
    // Get badges
    const { data: badges } = await supabase
        .from('provider_badges')
        .select('badge_type, earned_at')
        .eq('provider_id', providerId)
    
    const profiles = provider.profiles as { id: string; full_name: string | null; email: string; avatar_url: string | null } | null
    const ratings = provider.provider_ratings as { average_rating: number | null; total_reviews: number; total_transactions: number } | null
    
    const profile: PublicProfile = {
        id: provider.id as string,
        user_id: provider.user_id as string,
        username: provider.username as string | null,
        profile_slug: provider.profile_slug as string | null,
        headline: provider.headline as string | null,
        bio: provider.bio as string | null,
        video_url: provider.video_url as string | null,
        video_thumbnail_url: provider.video_thumbnail_url as string | null,
        linkedin_url: provider.linkedin_url as string | null,
        website_url: provider.website_url as string | null,
        location: provider.location as string | null,
        years_experience: provider.years_experience as number | null,
        day_rate: provider.day_rate as number | null,
        hourly_rate: provider.hourly_rate as number | null,
        currency: (provider.currency as string) || 'GBP',
        timezone: (provider.timezone as string) || 'Europe/London',
        tier: (provider.tier as string) || 'standard',
        is_public: true,
        profile_completeness: (provider.profile_completeness as number) || 0,
        profile_views: (provider.profile_views as number) || 0,
        specializations: (provider.specializations as string[]) || [],
        industries: (provider.industries as string[]) || [],
        company_stages: (provider.company_stages as string[]) || [],
        accepts_trial: (provider.accepts_trial as boolean) ?? true,
        trial_rate_discount: (provider.trial_rate_discount as number) || 0,
        minimum_engagement_hours: (provider.minimum_engagement_hours as number) || 10,
        user_name: profiles?.full_name || null,
        user_email: profiles?.email || null,
        user_avatar: profiles?.avatar_url || null,
        average_rating: ratings?.average_rating || null,
        total_reviews: ratings?.total_reviews || 0,
        total_transactions: ratings?.total_transactions || 0,
        case_studies: (caseStudies || []).map(cs => ({
            id: cs.id,
            title: cs.title,
            client_name: cs.client_name,
            client_logo_url: cs.client_logo_url,
            client_industry: cs.client_industry,
            company_stage: cs.company_stage,
            challenge: cs.challenge,
            approach: cs.approach,
            outcome: cs.outcome,
            metrics: (cs.metrics || []) as unknown as { label: string; value: string; change_percent?: number }[],
            testimonial_quote: cs.testimonial_quote,
            testimonial_author: cs.testimonial_author,
            testimonial_role: cs.testimonial_role,
            start_date: cs.start_date,
            end_date: cs.end_date,
            engagement_type: cs.engagement_type,
            hours_per_week: cs.hours_per_week,
            is_featured: cs.is_featured
        })),
        portfolio_items: (portfolio || []).map(p => ({
            id: p.id,
            title: p.title,
            description: p.description,
            image_urls: p.image_urls || [],
            project_url: p.project_url,
            client_name: p.client_name,
            completion_date: p.completion_date,
            is_featured: p.is_featured
        })),
        certifications: (certifications || []).map(c => ({
            id: c.id,
            certification_name: c.certification_name,
            issuing_body: c.issuing_body,
            credential_id: c.credential_id,
            issued_date: c.issued_date,
            expiry_date: c.expiry_date,
            verification_url: c.verification_url,
            is_verified: c.is_verified
        })),
        badges: (badges || []).map(b => ({
            badge_type: b.badge_type,
            earned_at: b.earned_at
        }))
    }
    
    return { profile, error: null }
}

export async function trackProfileView(providerSlug: string, source: 'marketplace' | 'search' | 'direct' | 'rfq' | 'referral' = 'direct') {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    // Validate and sanitize slug - only allow alphanumeric, hyphens, and underscores
    const sanitizedSlug = providerSlug.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!sanitizedSlug || sanitizedSlug.length === 0) {
        return
    }
    
    // Get provider ID from slug using separate queries instead of .or() with string interpolation
    let provider = null
    const { data: bySlug } = await supabase
        .from('provider_profiles')
        .select('id, user_id')
        .eq('profile_slug', sanitizedSlug)
        .single()
    
    if (bySlug) {
        provider = bySlug
    } else {
        const { data: byUsername } = await supabase
            .from('provider_profiles')
            .select('id, user_id')
            .eq('username', sanitizedSlug)
            .single()
        provider = byUsername
    }
    
    if (!provider) return
    
    // Don't track if viewing own profile
    if (user?.id === provider.user_id) return
    
    // Insert view record
    await supabase.from('profile_views').insert({
        provider_id: provider.id,
        viewer_id: user?.id || null,
        source
    })
    
    // Increment view counter
    await supabase.rpc('increment_profile_views', { provider_id_input: provider.id })
}

export async function updateProfileSlug(newSlug: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(newSlug)) {
        return { success: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' }
    }
    
    if (newSlug.length < 3 || newSlug.length > 50) {
        return { success: false, error: 'Slug must be between 3 and 50 characters' }
    }
    
    // Check if slug is available
    const { data: existing } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('profile_slug', newSlug)
        .neq('user_id', user.id)
        .single()
    
    if (existing) {
        return { success: false, error: 'This URL is already taken' }
    }
    
    // Update slug
    const { error } = await supabase
        .from('provider_profiles')
        .update({ profile_slug: newSlug })
        .eq('user_id', user.id)
    
    if (error) {
        return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/profile')
    return { success: true, error: null }
}

export async function updatePublicProfileSettings(settings: {
    is_public?: boolean
    accepts_trial?: boolean
    trial_rate_discount?: number
    minimum_engagement_hours?: number
    video_url?: string
    linkedin_url?: string
    website_url?: string
    location?: string
    years_experience?: number
    specializations?: string[]
    industries?: string[]
    company_stages?: string[]
}): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    const { error } = await supabase
        .from('provider_profiles')
        .update(settings)
        .eq('user_id', user.id)
    
    if (error) {
        return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/profile')
    return { success: true, error: null }
}
