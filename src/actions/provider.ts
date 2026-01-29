"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Types for provider data
export interface ProviderProfile {
    id: string
    user_id: string
    listing_id: string | null
    stripe_account_id: string | null
    stripe_onboarding_complete: boolean
    day_rate: number | null
    currency: string
    bio: string | null
    headline: string | null
    tier: 'pending' | 'standard' | 'verified' | 'premium'
    is_active: boolean
    max_concurrent_orders: number
    current_order_count: number
    auto_pause_at_capacity: boolean
    timezone: string
    out_of_office: boolean
    out_of_office_message: string | null
    out_of_office_until: string | null
    auto_response_enabled: boolean
    auto_response_message: string | null
    auto_response_delay_minutes: number
    created_at: string
}

export interface ProviderApplication {
    id: string
    user_id: string
    category: string
    company_name: string | null
    application_data: {
        experience?: string
        capabilities?: string[]
        pricing_model?: string
        availability?: string
        portfolio_url?: string
        linkedin_url?: string
        certifications?: string[]
    }
    status: 'pending' | 'under_review' | 'approved' | 'rejected'
    assigned_tier: 'pending' | 'standard' | 'verified' | 'premium' | null
    reviewer_id: string | null
    reviewer_notes: string | null
    submitted_at: string
    reviewed_at: string | null
}

export interface ProviderDashboardStats {
    earningsThisMonth: number
    pendingPayout: number
    activeOrdersCount: number
    upcomingBookingsCount: number
    profileCompletionPercent: number
    totalEarnings: number
    averageRating: number | null
    reviewCount: number
}

export interface ProviderOrder {
    id: string
    order_number: string
    buyer_name: string
    listing_title: string | null
    status: string
    total_amount: number
    currency: string
    created_at: string
}

/**
 * Get the current user's provider profile
 */
export async function getProviderProfile(): Promise<{
    profile: ProviderProfile | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { profile: null, error: "Not authenticated" }
        }

        const { data, error } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                // No profile found
                return { profile: null, error: null }
            }
            console.error('Error fetching provider profile:', error)
            return { profile: null, error: error.message }
        }

        return { profile: data as ProviderProfile, error: null }
    } catch (err) {
        console.error('Failed to fetch provider profile:', err)
        return { profile: null, error: 'Failed to fetch provider profile' }
    }
}

/**
 * Update provider profile fields
 */
export async function updateProviderProfile(data: {
    headline?: string
    bio?: string
    day_rate?: number
    currency?: string
    timezone?: string
    max_concurrent_orders?: number
    auto_pause_at_capacity?: boolean
    out_of_office?: boolean
    out_of_office_message?: string
    out_of_office_until?: string
    auto_response_enabled?: boolean
    auto_response_message?: string
    auto_response_delay_minutes?: number
}): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { success: false, error: "Not authenticated" }
        }

        // Clean up data - remove undefined values
        const updateData = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined)
        )

        const { error } = await supabase
            .from('provider_profiles')
            .update(updateData)
            .eq('user_id', user.id)

        if (error) {
            console.error('Error updating provider profile:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal')
        revalidatePath('/provider-portal/profile')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update provider profile:', err)
        return { success: false, error: 'Failed to update provider profile' }
    }
}

/**
 * Submit a provider application
 */
export async function submitProviderApplication(data: {
    category: string
    company_name?: string
    experience: string
    capabilities: string[]
    pricing_model: string
    availability: string
    portfolio_url?: string
    linkedin_url?: string
    certifications?: string[]
}): Promise<{ success: boolean; applicationId?: string; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { success: false, error: "Not authenticated" }
        }

        // Check if user already has a pending application
        const { data: existingApplication } = await supabase
            .from('provider_applications')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['pending', 'under_review'])
            .single()

        if (existingApplication) {
            return { 
                success: false, 
                error: "You already have a pending application" 
            }
        }

        // Check if user already has a provider profile
        const { data: existingProfile } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (existingProfile) {
            return { 
                success: false, 
                error: "You already have a provider profile" 
            }
        }

        const applicationData = {
            experience: data.experience,
            capabilities: data.capabilities,
            pricing_model: data.pricing_model,
            availability: data.availability,
            portfolio_url: data.portfolio_url,
            linkedin_url: data.linkedin_url,
            certifications: data.certifications || []
        }

        const { data: newApplication, error } = await supabase
            .from('provider_applications')
            .insert({
                user_id: user.id,
                category: data.category,
                company_name: data.company_name || null,
                application_data: applicationData,
                status: 'pending'
            })
            .select('id')
            .single()

        if (error) {
            console.error('Error submitting provider application:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/become-provider')
        return { success: true, applicationId: newApplication.id, error: null }
    } catch (err) {
        console.error('Failed to submit provider application:', err)
        return { success: false, error: 'Failed to submit application' }
    }
}

/**
 * Get provider dashboard statistics
 */
export async function getProviderDashboardStats(): Promise<{
    stats: ProviderDashboardStats | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { stats: null, error: "Not authenticated" }
        }

        // Get provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('id, headline, bio, stripe_onboarding_complete, day_rate')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile) {
            return { stats: null, error: "Provider profile not found" }
        }

        // Calculate profile completion percentage
        let completionScore = 0
        if (profile.headline) completionScore += 20
        if (profile.bio) completionScore += 25
        if (profile.stripe_onboarding_complete) completionScore += 35
        if (profile.day_rate) completionScore += 20

        // Get earnings this month
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const { data: monthlyOrders } = await supabase
            .from('orders')
            .select('total_amount, platform_fee')
            .eq('seller_id', profile.id)
            .eq('status', 'completed')
            .gte('completed_at', startOfMonth.toISOString())

        const earningsThisMonth = (monthlyOrders || []).reduce(
            (sum, order) => sum + (Number(order.total_amount) - Number(order.platform_fee || 0)),
            0
        )

        // Get pending payout (orders completed but not paid out)
        const { data: pendingOrders } = await supabase
            .from('orders')
            .select('total_amount, platform_fee')
            .eq('seller_id', profile.id)
            .eq('status', 'completed')
            .eq('escrow_status', 'held')

        const pendingPayout = (pendingOrders || []).reduce(
            (sum, order) => sum + (Number(order.total_amount) - Number(order.platform_fee || 0)),
            0
        )

        // Get active orders count
        const { count: activeOrdersCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', profile.id)
            .in('status', ['pending', 'accepted', 'in_progress'] as any)

        // Get upcoming bookings count
        const today = new Date().toISOString().split('T')[0]
        const { count: upcomingBookingsCount } = await supabase
            .from('availability_slots')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', profile.id)
            .eq('status', 'booked')
            .gte('date', today)

        // Get total earnings
        const { data: allCompletedOrders } = await supabase
            .from('orders')
            .select('total_amount, platform_fee')
            .eq('seller_id', profile.id)
            .eq('status', 'completed')

        const totalEarnings = (allCompletedOrders || []).reduce(
            (sum, order) => sum + (Number(order.total_amount) - Number(order.platform_fee || 0)),
            0
        )

        // Get average rating
        const { data: reviews } = await supabase
            .from('reviews')
            .select('rating')
            .eq('reviewee_id', profile.id)

        const reviewCount = reviews?.length || 0
        const averageRating = reviewCount > 0
            ? reviews!.reduce((sum, r) => sum + r.rating, 0) / reviewCount
            : null

        return {
            stats: {
                earningsThisMonth,
                pendingPayout,
                activeOrdersCount: activeOrdersCount || 0,
                upcomingBookingsCount: upcomingBookingsCount || 0,
                profileCompletionPercent: completionScore,
                totalEarnings,
                averageRating,
                reviewCount
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to fetch provider dashboard stats:', err)
        return { stats: null, error: 'Failed to fetch dashboard stats' }
    }
}

/**
 * Get provider orders
 */
export async function getProviderOrders(options?: {
    status?: string[]
    limit?: number
}): Promise<{
    orders: ProviderOrder[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { orders: [], error: "Not authenticated" }
        }

        // Get provider profile ID
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile) {
            return { orders: [], error: "Provider profile not found" }
        }

        let query = supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                total_amount,
                currency,
                created_at,
                buyer:profiles!orders_buyer_id_fkey(full_name),
                listing:marketplace_listings(title)
            `)
            .eq('seller_id', profile.id)
            .order('created_at', { ascending: false })

        if (options?.status && options.status.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            query = query.in('status', options.status as any)
        }

        if (options?.limit) {
            query = query.limit(options.limit)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching provider orders:', error)
            return { orders: [], error: error.message }
        }

        const orders: ProviderOrder[] = (data || []).map((order: any) => ({
            id: order.id,
            order_number: order.order_number || '',
            buyer_name: order.buyer?.full_name || 'Unknown',
            listing_title: order.listing?.title || null,
            status: order.status,
            total_amount: Number(order.total_amount),
            currency: order.currency,
            created_at: order.created_at
        }))

        return { orders, error: null }
    } catch (err) {
        console.error('Failed to fetch provider orders:', err)
        return { orders: [], error: 'Failed to fetch orders' }
    }
}

/**
 * Get user's provider application status
 */
export async function getProviderApplicationStatus(): Promise<{
    application: ProviderApplication | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { application: null, error: "Not authenticated" }
        }

        const { data, error } = await supabase
            .from('provider_applications')
            .select('*')
            .eq('user_id', user.id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                return { application: null, error: null }
            }
            console.error('Error fetching provider application:', error)
            return { application: null, error: error.message }
        }

        return { application: data as ProviderApplication, error: null }
    } catch (err) {
        console.error('Failed to fetch provider application:', err)
        return { application: null, error: 'Failed to fetch application' }
    }
}

/**
 * Get recent activity for the provider dashboard
 */
export async function getProviderRecentActivity(limit: number = 10): Promise<{
    activities: Array<{
        id: string
        type: 'order' | 'review' | 'booking' | 'payout'
        title: string
        description: string
        created_at: string
    }>
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { activities: [], error: "Not authenticated" }
        }

        // Get provider profile ID
        const { data: profile } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (!profile) {
            return { activities: [], error: "Provider profile not found" }
        }

        // Get recent orders
        const { data: recentOrders } = await supabase
            .from('orders')
            .select('id, order_number, status, total_amount, currency, created_at')
            .eq('seller_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(limit)

        // Get recent reviews
        const { data: recentReviews } = await supabase
            .from('reviews')
            .select('id, rating, created_at')
            .eq('reviewee_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(limit)

        // Combine and sort activities
        const activities: Array<{
            id: string
            type: 'order' | 'review' | 'booking' | 'payout'
            title: string
            description: string
            created_at: string
        }> = []

        // Add orders
        for (const order of recentOrders || []) {
            activities.push({
                id: order.id,
                type: 'order',
                title: `Order ${order.order_number || order.id.slice(0, 8)}`,
                description: `Status: ${order.status} - ${order.currency} ${Number(order.total_amount).toFixed(2)}`,
                created_at: order.created_at
            })
        }

        // Add reviews
        for (const review of recentReviews || []) {
            activities.push({
                id: review.id,
                type: 'review',
                title: 'New Review',
                description: `Rating: ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`,
                created_at: review.created_at
            })
        }

        // Sort by date
        activities.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        return { activities: activities.slice(0, limit), error: null }
    } catch (err) {
        console.error('Failed to fetch provider activity:', err)
        return { activities: [], error: 'Failed to fetch activity' }
    }
}

/**
 * Create a provider profile from the signup flow
 * Used during migration and new provider onboarding
 */
export async function createProviderFromSignup(data: {
    displayName: string
    businessType: 'individual' | 'company'
    headline?: string
    bio?: string
    dayRate?: number
    currency?: string
    listingId?: string
}): Promise<{
    success: boolean
    providerId?: string
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { success: false, error: "Not authenticated" }
        }

        // Check if user already has a provider profile
        const { data: existingProfile } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (existingProfile) {
            return { 
                success: false, 
                error: "You already have a provider profile" 
            }
        }

        // If a listing ID is provided, verify it exists and isn't linked
        if (data.listingId) {
            const { data: existingListing } = await supabase
                .from('provider_profiles')
                .select('id')
                .eq('listing_id', data.listingId)
                .single()
            
            if (existingListing) {
                return {
                    success: false,
                    error: "This listing is already linked to a provider"
                }
            }
        }

        // Create the provider profile
        const { data: newProfile, error: createError } = await supabase
            .from('provider_profiles')
            .insert({
                user_id: user.id,
                display_name: data.displayName,
                business_type: data.businessType,
                headline: data.headline || null,
                bio: data.bio || null,
                day_rate: data.dayRate || null,
                currency: data.currency || 'GBP',
                listing_id: data.listingId || null,
                tier: 'pending',
                is_active: true,
                stripe_onboarding_complete: false,
                max_concurrent_orders: 5,
                current_order_count: 0,
                auto_pause_at_capacity: true,
                timezone: 'Europe/London'
            })
            .select('id')
            .single()

        if (createError) {
            console.error('Error creating provider profile:', createError)
            return { success: false, error: createError.message }
        }

        revalidatePath('/provider-portal')
        revalidatePath('/provider-signup')
        revalidatePath('/marketplace')
        
        return { 
            success: true, 
            providerId: newProfile.id, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to create provider profile:', err)
        return { success: false, error: 'Failed to create provider profile' }
    }
}

/**
 * Initiate Stripe Connect onboarding for a provider
 */
export async function initiateStripeOnboarding(): Promise<{
    success: boolean
    onboardingUrl?: string
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return { success: false, error: "Not authenticated" }
        }

        // Get provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('id, stripe_account_id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile) {
            return { success: false, error: "Provider profile not found" }
        }

        // If no Stripe account exists, create one
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        // In production, this would call Stripe API
        // For now, return a simulated onboarding URL
        // TODO: Integrate with actual Stripe Connect API
        const stripeOnboardingUrl = `${appUrl}/api/stripe/connect/onboard?provider=${profile.id}`

        return { 
            success: true, 
            onboardingUrl: stripeOnboardingUrl,
            error: null 
        }
    } catch (err) {
        console.error('Failed to initiate Stripe onboarding:', err)
        return { success: false, error: 'Failed to initiate Stripe onboarding' }
    }
}
