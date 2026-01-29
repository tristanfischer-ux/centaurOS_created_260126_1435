"use server"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Using 'any' type assertions because provider_ratings and orders tables are not in generated database types

import { createClient } from "@/lib/supabase/server"

export interface ProviderRating {
    id: string
    provider_id: string
    reviewer_id: string
    reviewer_name: string | null
    reviewer_avatar: string | null
    order_id: string | null
    rating: number
    comment: string | null
    is_anonymous: boolean
    is_verified_purchase: boolean
    created_at: string
}

export interface RatingsSummary {
    averageRating: number | null
    totalReviews: number
    ratingDistribution: {
        1: number
        2: number
        3: number
        4: number
        5: number
    }
    isNewProvider: boolean
}

// Internal type for database records
interface RatingRecord {
    rating: number
}

interface ReviewRecord {
    id: string
    provider_id: string
    reviewer_id: string
    order_id: string | null
    rating: number
    comment: string | null
    is_anonymous: boolean
    is_verified_purchase: boolean
    created_at: string
    reviewer?: {
        full_name: string | null
        avatar_url: string | null
    }
}

interface OrderRecord {
    id: string
    buyer_id: string
    status: string
}

/**
 * Get ratings summary for a provider
 */
export async function getProviderRatings(providerId: string): Promise<{
    data: RatingsSummary | null
    error: string | null
}> {
    try {
        const supabase = await createClient()

        // Using type assertion since table not in generated types
        const { data: reviews, error } = await (supabase as any)
            .from('provider_ratings')
            .select('rating')
            .eq('provider_id', providerId) as { data: RatingRecord[] | null; error: any }

        if (error) {
            console.error('Error fetching provider ratings:', error)
            return { data: null, error: error.message }
        }

        if (!reviews || reviews.length === 0) {
            return {
                data: {
                    averageRating: null,
                    totalReviews: 0,
                    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    isNewProvider: true,
                },
                error: null,
            }
        }

        // Calculate statistics
        const totalReviews = reviews.length
        const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews

        // Calculate distribution
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        for (const review of reviews) {
            const rating = Math.round(review.rating) as 1 | 2 | 3 | 4 | 5
            if (rating >= 1 && rating <= 5) {
                ratingDistribution[rating]++
            }
        }

        return {
            data: {
                averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
                totalReviews,
                ratingDistribution,
                isNewProvider: totalReviews < 3,
            },
            error: null,
        }
    } catch (err) {
        console.error('Failed to fetch provider ratings:', err)
        return { data: null, error: 'Failed to fetch provider ratings' }
    }
}

/**
 * Get paginated reviews for a provider
 */
export async function getProviderReviews(
    providerId: string,
    limit: number = 10,
    offset: number = 0
): Promise<{
    data: ProviderRating[]
    total: number
    error: string | null
}> {
    try {
        const supabase = await createClient()

        // Get total count - using type assertion since table not in generated types
        const { count, error: countError } = await (supabase as any)
            .from('provider_ratings')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId) as { count: number | null; error: any }

        if (countError) {
            console.error('Error counting reviews:', countError)
            return { data: [], total: 0, error: countError.message }
        }

        // Get reviews with reviewer info
        const { data: reviews, error } = await (supabase as any)
            .from('provider_ratings')
            .select(`
                id,
                provider_id,
                reviewer_id,
                order_id,
                rating,
                comment,
                is_anonymous,
                is_verified_purchase,
                created_at,
                reviewer:profiles!provider_ratings_reviewer_id_fkey(
                    full_name,
                    avatar_url
                )
            `)
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1) as { data: ReviewRecord[] | null; error: any }

        if (error) {
            console.error('Error fetching reviews:', error)
            return { data: [], total: 0, error: error.message }
        }

        const formattedReviews: ProviderRating[] = (reviews || []).map((review) => ({
            id: review.id,
            provider_id: review.provider_id,
            reviewer_id: review.reviewer_id,
            reviewer_name: review.is_anonymous ? null : review.reviewer?.full_name || null,
            reviewer_avatar: review.is_anonymous ? null : review.reviewer?.avatar_url || null,
            order_id: review.order_id,
            rating: review.rating,
            comment: review.comment,
            is_anonymous: review.is_anonymous,
            is_verified_purchase: review.is_verified_purchase,
            created_at: review.created_at,
        }))

        return {
            data: formattedReviews,
            total: count || 0,
            error: null,
        }
    } catch (err) {
        console.error('Failed to fetch provider reviews:', err)
        return { data: [], total: 0, error: 'Failed to fetch provider reviews' }
    }
}

/**
 * Submit a review for a provider (buyer action)
 */
export async function submitProviderReview(data: {
    providerId: string
    orderId?: string
    rating: number
    comment?: string
    isAnonymous?: boolean
}): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: "Not authenticated" }
        }

        // Validate rating
        if (data.rating < 1 || data.rating > 5) {
            return { success: false, error: "Rating must be between 1 and 5" }
        }

        // Check if user already reviewed this provider for this order
        if (data.orderId) {
            const { data: existingReview } = await (supabase as any)
                .from('provider_ratings')
                .select('id')
                .eq('provider_id', data.providerId)
                .eq('reviewer_id', user.id)
                .eq('order_id', data.orderId)
                .single()

            if (existingReview) {
                return { success: false, error: "You have already reviewed this order" }
            }
        }

        // Determine if this is a verified purchase
        let isVerifiedPurchase = false
        if (data.orderId) {
            const { data: order } = await (supabase as any)
                .from('orders')
                .select('id, buyer_id, status')
                .eq('id', data.orderId)
                .eq('buyer_id', user.id)
                .eq('status', 'completed')
                .single() as { data: OrderRecord | null }

            isVerifiedPurchase = !!order
        }

        const { error } = await (supabase as any)
            .from('provider_ratings')
            .insert({
                provider_id: data.providerId,
                reviewer_id: user.id,
                order_id: data.orderId || null,
                rating: Math.round(data.rating),
                comment: data.comment?.trim() || null,
                is_anonymous: data.isAnonymous || false,
                is_verified_purchase: isVerifiedPurchase,
            })

        if (error) {
            console.error('Error submitting review:', error)
            return { success: false, error: error.message }
        }

        // Trigger badge check for the provider
        // Import dynamically to avoid circular dependencies
        const { checkAndAwardBadges } = await import('./badges')
        await checkAndAwardBadges(data.providerId)

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to submit review:', err)
        return { success: false, error: 'Failed to submit review' }
    }
}
