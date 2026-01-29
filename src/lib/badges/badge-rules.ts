/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Using 'any' type assertions because provider tables are not in generated database types

/**
 * Badge eligibility rules and evaluation logic
 * 
 * Badge Types:
 * - fast_responder: <2hr average response time
 * - top_rated: 4.8+ rating with 10+ reviews
 * - reliable: 95%+ on-time delivery rate with 10+ orders
 * - verified_partner: Full vetting complete (manual award)
 * - rising_star: New provider with exceptional performance
 */

import { createClient } from "@/lib/supabase/server"

export type BadgeType = 
    | 'fast_responder' 
    | 'top_rated' 
    | 'reliable' 
    | 'verified_partner' 
    | 'rising_star'

export interface BadgeEligibilityResult {
    badgeType: BadgeType
    eligible: boolean
    alreadyHas: boolean
    progress?: number // 0-100 percentage
    progressDescription?: string
}

// Internal types for database records
interface BadgeRecord {
    id: string
}

interface ProfileRecord {
    created_at: string | null
}

interface RatingRecord {
    rating: number
}

interface OrderRecord {
    status: string
    delivered_at: string | null
    expected_delivery_date: string | null
}

interface ProviderProfileRecord {
    avg_response_time_hours?: number
}

const BADGE_THRESHOLDS = {
    fast_responder: {
        maxResponseHours: 2,
        minMessages: 10,
    },
    top_rated: {
        minRating: 4.8,
        minReviews: 10,
    },
    reliable: {
        minCompletionRate: 0.95,
        minOrders: 10,
    },
    rising_star: {
        maxDaysActive: 90,
        minRating: 4.5,
        minOrders: 3,
        minCompletionRate: 0.9,
    },
}

/**
 * Check if a provider already has a specific badge
 */
async function hasBadge(providerId: string, badgeType: BadgeType): Promise<boolean> {
    const supabase = await createClient()
    
    // Using type assertion since table not in generated types
    const { data } = await (supabase as any)
        .from('provider_badges')
        .select('id')
        .eq('provider_id', providerId)
        .eq('badge_type', badgeType)
        .single() as { data: BadgeRecord | null }

    return !!data
}

/**
 * Get provider stats for badge evaluation
 */
async function getProviderStats(providerId: string) {
    const supabase = await createClient()

    // Get provider profile creation date - using type assertion since table not in generated types
    const { data: profile } = await (supabase as any)
        .from('provider_profiles')
        .select('created_at')
        .eq('id', providerId)
        .single() as { data: ProfileRecord | null }

    // Get rating stats
    const { data: ratings } = await (supabase as any)
        .from('provider_ratings')
        .select('rating')
        .eq('provider_id', providerId) as { data: RatingRecord[] | null }

    const totalReviews = ratings?.length || 0
    const averageRating = totalReviews > 0
        ? ratings!.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0

    // Get order stats
    const { data: orders } = await (supabase as any)
        .from('orders')
        .select('status, delivered_at, expected_delivery_date')
        .eq('seller_id', providerId) as { data: OrderRecord[] | null }

    const totalOrders = orders?.length || 0
    const completedOrders = orders?.filter(o => o.status === 'completed').length || 0
    const onTimeOrders = orders?.filter(o => {
        if (o.status !== 'completed' || !o.delivered_at || !o.expected_delivery_date) return false
        return new Date(o.delivered_at) <= new Date(o.expected_delivery_date)
    }).length || 0

    const completionRate = completedOrders > 0 ? completedOrders / totalOrders : 0
    const onTimeRate = completedOrders > 0 ? onTimeOrders / completedOrders : 0

    // Calculate days active
    const daysActive = profile?.created_at
        ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0

    // Get average response time (from conversations)
    // This would ideally query a messages/conversations table
    // For now, we'll use a placeholder - this should be customized based on your messaging system
    const avgResponseHours = await getAverageResponseTime(providerId)

    return {
        daysActive,
        totalReviews,
        averageRating,
        totalOrders,
        completedOrders,
        completionRate,
        onTimeRate,
        avgResponseHours,
    }
}

/**
 * Get average response time for a provider
 * This should be customized based on your messaging implementation
 */
async function getAverageResponseTime(providerId: string): Promise<number | null> {
    const supabase = await createClient()

    // Try to get response time from provider profile or messaging stats
    // This is a placeholder - adjust based on your actual schema
    const { data: profile } = await (supabase as any)
        .from('provider_profiles')
        .select('avg_response_time_hours')
        .eq('id', providerId)
        .single() as { data: ProviderProfileRecord | null }

    if (profile && 'avg_response_time_hours' in profile && profile.avg_response_time_hours !== undefined) {
        return profile.avg_response_time_hours
    }

    // If no stats available, return null
    return null
}

/**
 * Check eligibility for a specific badge type
 */
export async function checkBadgeEligibility(
    providerId: string, 
    badgeType: BadgeType
): Promise<BadgeEligibilityResult> {
    const alreadyHas = await hasBadge(providerId, badgeType)
    
    if (alreadyHas) {
        return {
            badgeType,
            eligible: false,
            alreadyHas: true,
        }
    }

    const stats = await getProviderStats(providerId)

    switch (badgeType) {
        case 'fast_responder':
            return checkFastResponder(stats, badgeType)
        
        case 'top_rated':
            return checkTopRated(stats, badgeType)
        
        case 'reliable':
            return checkReliable(stats, badgeType)
        
        case 'verified_partner':
            // This is manually awarded, not auto-eligible
            return {
                badgeType,
                eligible: false,
                alreadyHas: false,
                progressDescription: 'Awarded by CentaurOS team after vetting',
            }
        
        case 'rising_star':
            return checkRisingStar(stats, badgeType)
        
        default:
            return {
                badgeType,
                eligible: false,
                alreadyHas: false,
            }
    }
}

function checkFastResponder(
    stats: Awaited<ReturnType<typeof getProviderStats>>,
    badgeType: BadgeType
): BadgeEligibilityResult {
    const threshold = BADGE_THRESHOLDS.fast_responder

    if (stats.avgResponseHours === null) {
        return {
            badgeType,
            eligible: false,
            alreadyHas: false,
            progress: 0,
            progressDescription: 'Start responding to messages to track your response time',
        }
    }

    const eligible = stats.avgResponseHours <= threshold.maxResponseHours
    const progress = Math.min(100, (threshold.maxResponseHours / stats.avgResponseHours) * 100)

    return {
        badgeType,
        eligible,
        alreadyHas: false,
        progress: Math.round(progress),
        progressDescription: `Average response time: ${stats.avgResponseHours.toFixed(1)} hours (need ≤${threshold.maxResponseHours} hours)`,
    }
}

function checkTopRated(
    stats: Awaited<ReturnType<typeof getProviderStats>>,
    badgeType: BadgeType
): BadgeEligibilityResult {
    const threshold = BADGE_THRESHOLDS.top_rated
    
    const ratingProgress = (stats.averageRating / threshold.minRating) * 100
    const reviewProgress = (stats.totalReviews / threshold.minReviews) * 100
    const progress = Math.min(ratingProgress, reviewProgress)

    const eligible = 
        stats.averageRating >= threshold.minRating && 
        stats.totalReviews >= threshold.minReviews

    let progressDescription = ''
    if (stats.totalReviews < threshold.minReviews) {
        progressDescription = `${stats.totalReviews}/${threshold.minReviews} reviews`
    } else if (stats.averageRating < threshold.minRating) {
        progressDescription = `Rating ${stats.averageRating.toFixed(1)}/${threshold.minRating}`
    } else {
        progressDescription = 'Eligible!'
    }

    return {
        badgeType,
        eligible,
        alreadyHas: false,
        progress: Math.round(progress),
        progressDescription,
    }
}

function checkReliable(
    stats: Awaited<ReturnType<typeof getProviderStats>>,
    badgeType: BadgeType
): BadgeEligibilityResult {
    const threshold = BADGE_THRESHOLDS.reliable
    
    const completionProgress = (stats.onTimeRate / threshold.minCompletionRate) * 100
    const orderProgress = (stats.completedOrders / threshold.minOrders) * 100
    const progress = Math.min(completionProgress, orderProgress)

    const eligible = 
        stats.onTimeRate >= threshold.minCompletionRate && 
        stats.completedOrders >= threshold.minOrders

    let progressDescription = ''
    if (stats.completedOrders < threshold.minOrders) {
        progressDescription = `${stats.completedOrders}/${threshold.minOrders} completed orders`
    } else if (stats.onTimeRate < threshold.minCompletionRate) {
        progressDescription = `On-time rate: ${(stats.onTimeRate * 100).toFixed(0)}% (need ${threshold.minCompletionRate * 100}%)`
    } else {
        progressDescription = 'Eligible!'
    }

    return {
        badgeType,
        eligible,
        alreadyHas: false,
        progress: Math.round(progress),
        progressDescription,
    }
}

function checkRisingStar(
    stats: Awaited<ReturnType<typeof getProviderStats>>,
    badgeType: BadgeType
): BadgeEligibilityResult {
    const threshold = BADGE_THRESHOLDS.rising_star

    // Must be within first 90 days
    if (stats.daysActive > threshold.maxDaysActive) {
        return {
            badgeType,
            eligible: false,
            alreadyHas: false,
            progress: 0,
            progressDescription: 'This badge is for providers in their first 90 days',
        }
    }

    const meetsRating = stats.averageRating >= threshold.minRating
    const meetsOrders = stats.completedOrders >= threshold.minOrders
    const meetsCompletion = stats.completionRate >= threshold.minCompletionRate

    const eligible = meetsRating && meetsOrders && meetsCompletion

    // Calculate progress based on all criteria
    const ratingProgress = Math.min(100, (stats.averageRating / threshold.minRating) * 100)
    const orderProgress = Math.min(100, (stats.completedOrders / threshold.minOrders) * 100)
    const completionProgress = Math.min(100, (stats.completionRate / threshold.minCompletionRate) * 100)
    const progress = (ratingProgress + orderProgress + completionProgress) / 3

    const needs: string[] = []
    if (!meetsOrders) needs.push(`${stats.completedOrders}/${threshold.minOrders} orders`)
    if (!meetsRating && stats.totalReviews > 0) needs.push(`${stats.averageRating.toFixed(1)}/${threshold.minRating} rating`)
    if (!meetsCompletion) needs.push(`${(stats.completionRate * 100).toFixed(0)}%/${threshold.minCompletionRate * 100}% completion`)

    const progressDescription = needs.length > 0 
        ? `Needs: ${needs.join(', ')}`
        : 'Eligible!'

    return {
        badgeType,
        eligible,
        alreadyHas: false,
        progress: Math.round(progress),
        progressDescription,
    }
}

/**
 * Evaluate all badges for a provider
 */
export async function evaluateAllBadges(providerId: string): Promise<BadgeEligibilityResult[]> {
    const badgeTypes: BadgeType[] = [
        'fast_responder',
        'top_rated',
        'reliable',
        'verified_partner',
        'rising_star',
    ]

    const results = await Promise.all(
        badgeTypes.map(type => checkBadgeEligibility(providerId, type))
    )

    return results
}

/**
 * Award a badge to a provider
 */
export async function awardBadge(
    providerId: string, 
    badgeType: BadgeType
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()

    // Check if already has badge
    const alreadyHas = await hasBadge(providerId, badgeType)
    if (alreadyHas) {
        return { success: false, error: 'Provider already has this badge' }
    }

    // Using type assertion since table not in generated types
    const { error } = await (supabase as any)
        .from('provider_badges')
        .insert({
            provider_id: providerId,
            badge_type: badgeType,
            earned_at: new Date().toISOString(),
        })

    if (error) {
        console.error('Error awarding badge:', error)
        return { success: false, error: error.message }
    }

    return { success: true, error: null }
}
