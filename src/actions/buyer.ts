"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { 
    BuyerDashboardStats, 
    OrderSummary, 
    FavoriteProvider 
} from "@/types/booking"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

// ==========================================
// GET BUYER DASHBOARD STATS
// ==========================================

export async function getBuyerDashboardStats(): Promise<{
    data: BuyerDashboardStats | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        // Get active orders count
        const { count: activeOrdersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('buyer_id', user.id)
            .in('status', ['pending', 'accepted', 'in_progress'])

        // Get completed orders count
        const { count: completedOrdersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('buyer_id', user.id)
            .eq('status', 'completed')

        // Get total spend
        const { data: totalSpendData } = await supabase
            .from('orders')
            .select('total_amount, currency')
            .eq('buyer_id', user.id)
            .in('status', ['accepted', 'in_progress', 'completed'])

        const totalSpend = totalSpendData?.reduce((sum, order) => sum + order.total_amount, 0) || 0

        // Get spend this month
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const { data: monthlySpendData } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('buyer_id', user.id)
            .in('status', ['accepted', 'in_progress', 'completed'])
            .gte('created_at', startOfMonth.toISOString())

        const spendThisMonth = monthlySpendData?.reduce((sum, order) => sum + order.total_amount, 0) || 0

        // Get favorite providers count
        const { count: favoriteProvidersCount } = await supabase
            .from('preferred_suppliers')
            .select('*', { count: 'exact', head: true })
            .eq('buyer_id', user.id)

        // Get user's default currency from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        return {
            data: {
                activeOrdersCount: activeOrdersCount || 0,
                completedOrdersCount: completedOrdersCount || 0,
                totalSpend,
                spendThisMonth,
                favoriteProvidersCount: favoriteProvidersCount || 0,
                currency: 'GBP' // Default currency
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to get buyer dashboard stats:', err)
        return { data: null, error: 'Failed to get dashboard stats' }
    }
}

// ==========================================
// GET BUYER ORDERS
// ==========================================

export async function getBuyerOrders(
    status?: 'active' | 'completed' | 'cancelled',
    limit?: number
): Promise<{
    data: OrderSummary[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: [], error: 'Not authenticated' }
        }

        // Build query
        let query = supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                order_type,
                seller_id,
                listing_id,
                total_amount,
                currency,
                escrow_status,
                created_at,
                completed_at,
                marketplace_listings (
                    title,
                    category
                ),
                provider_profiles!orders_seller_id_fkey (
                    id,
                    user_id,
                    profiles!provider_profiles_user_id_fkey (
                        full_name,
                        avatar_url
                    )
                )
            `)
            .eq('buyer_id', user.id)
            .order('created_at', { ascending: false })

        // Filter by status
        if (status === 'active') {
            query = query.in('status', ['pending', 'accepted', 'in_progress'])
        } else if (status === 'completed') {
            query = query.eq('status', 'completed')
        } else if (status === 'cancelled') {
            query = query.in('status', ['cancelled', 'disputed'])
        }

        // Apply limit
        if (limit) {
            query = query.limit(limit)
        }

        const { data: orders, error } = await query

        if (error) {
            console.error('Error fetching orders:', error)
            return { data: [], error: error.message }
        }

        // Check for unread messages and reviews
        const orderIds = orders?.map(o => o.id) || []
        
        // Get conversations with unread messages
        const { data: conversations } = await supabase
            .from('conversations')
            .select(`
                order_id,
                messages (
                    is_read,
                    sender_id
                )
            `)
            .in('order_id', orderIds)

        const ordersWithUnread = new Set(
            conversations?.filter(c => 
                c.messages?.some(m => !m.is_read && m.sender_id !== user.id)
            ).map(c => c.order_id) || []
        )

        // Get reviews left by user
        const { data: reviews } = await supabase
            .from('reviews')
            .select('order_id')
            .eq('reviewer_id', user.id)
            .in('order_id', orderIds)

        const ordersWithReview = new Set(reviews?.map(r => r.order_id) || [])

        // Get booked dates for orders
        const { data: slots } = await supabase
            .from('availability_slots')
            .select('booking_id, date')
            .in('booking_id', orderIds)
            .order('date', { ascending: true })

        const slotsByOrder = slots?.reduce((acc, slot) => {
            if (!acc[slot.booking_id]) {
                acc[slot.booking_id] = []
            }
            acc[slot.booking_id].push(slot.date)
            return acc
        }, {} as Record<string, string[]>) || {}

        // Map to OrderSummary
        const orderSummaries: OrderSummary[] = (orders || []).map(order => {
            const orderSlots = slotsByOrder[order.id] || []
            const providerProfile = order.provider_profiles as { 
                id: string
                user_id: string
                profiles: { full_name?: string; avatar_url?: string } 
            } | null
            const listing = order.marketplace_listings as { title: string; category: string } | null

            return {
                id: order.id,
                orderNumber: order.order_number,
                status: order.status as OrderSummary['status'],
                bookingType: order.order_type as OrderSummary['bookingType'],
                providerId: order.seller_id,
                providerName: providerProfile?.profiles?.full_name || 'Provider',
                providerAvatarUrl: providerProfile?.profiles?.avatar_url,
                listingId: order.listing_id,
                listingTitle: listing?.title || 'Booking',
                listingCategory: (listing?.category as OrderSummary['listingCategory']) || 'Services',
                startDate: orderSlots[0],
                endDate: orderSlots[orderSlots.length - 1],
                createdAt: order.created_at,
                completedAt: order.completed_at,
                totalAmount: order.total_amount,
                currency: order.currency,
                escrowStatus: order.escrow_status as OrderSummary['escrowStatus'],
                conversationId: undefined as string | undefined, // Would need another query
                hasUnreadMessages: ordersWithUnread.has(order.id),
                hasLeftReview: ordersWithReview.has(order.id)
            }
        })

        return { data: orderSummaries, error: null }
    } catch (err) {
        console.error('Failed to get buyer orders:', err)
        return { data: [], error: 'Failed to get orders' }
    }
}

// ==========================================
// GET RECOMMENDED PROVIDERS
// ==========================================

export async function getRecommendedProviders(limit: number = 6): Promise<{
    data: FavoriteProvider[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: [], error: 'Not authenticated' }
        }

        // Get providers the user has worked with before (sorted by rating)
        const { data: previousProviders } = await supabase
            .from('orders')
            .select('seller_id')
            .eq('buyer_id', user.id)
            .eq('status', 'completed')

        const workedWithIds = [...new Set(previousProviders?.map(o => o.seller_id) || [])]

        // Get top-rated providers not already worked with
        const { data: providers, error } = await supabase
            .from('provider_profiles')
            .select(`
                id,
                user_id,
                day_rate,
                currency,
                headline,
                is_active,
                provider_ratings (
                    average_rating,
                    total_reviews
                ),
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                )
            `)
            .eq('is_active', true)
            .not('id', 'in', `(${workedWithIds.join(',')})`)
            .limit(limit)

        if (error) {
            console.error('Error fetching recommended providers:', error)
            return { data: [], error: error.message }
        }

        // Map to FavoriteProvider format
        const recommendations: FavoriteProvider[] = (providers || []).map(provider => {
            const profile = provider.profiles as { full_name?: string; avatar_url?: string } | null
            const ratings = provider.provider_ratings as { average_rating?: number; total_reviews?: number } | null

            return {
                providerId: provider.id,
                userId: provider.user_id,
                name: profile?.full_name || 'Provider',
                avatarUrl: profile?.avatar_url,
                headline: provider.headline ?? undefined,
                dayRate: provider.day_rate ?? undefined,
                currency: provider.currency || 'GBP',
                averageRating: ratings?.average_rating ?? undefined,
                totalReviews: ratings?.total_reviews || 0,
                isAvailable: provider.is_active,
                addedAt: new Date().toISOString(),
                notes: undefined as string | undefined,
                autoNotify: false
            }
        })

        return { data: recommendations, error: null }
    } catch (err) {
        console.error('Failed to get recommended providers:', err)
        return { data: [], error: 'Failed to get recommendations' }
    }
}

// ==========================================
// ADD TO FAVORITES
// ==========================================

export async function addToFavorites(
    providerId: string,
    notes?: string
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Check if already favorited
        const { data: existing } = await supabase
            .from('preferred_suppliers')
            .select('id')
            .eq('buyer_id', user.id)
            .eq('provider_id', providerId)
            .single()

        if (existing) {
            return { success: false, error: 'Provider already in favorites' }
        }

        // Add to favorites
        const { error } = await supabase
            .from('preferred_suppliers')
            .insert({
                buyer_id: user.id,
                provider_id: providerId,
                notes: notes || null
            })

        if (error) {
            console.error('Error adding to favorites:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/buyer')
        revalidatePath('/marketplace')

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to add to favorites:', err)
        return { success: false, error: 'Failed to add to favorites' }
    }
}

// ==========================================
// REMOVE FROM FAVORITES
// ==========================================

export async function removeFromFavorites(providerId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('preferred_suppliers')
            .delete()
            .eq('buyer_id', user.id)
            .eq('provider_id', providerId)

        if (error) {
            console.error('Error removing from favorites:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/buyer')
        revalidatePath('/marketplace')

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to remove from favorites:', err)
        return { success: false, error: 'Failed to remove from favorites' }
    }
}

// ==========================================
// GET FAVORITE PROVIDERS
// ==========================================

export async function getFavoriteProviders(): Promise<{
    data: FavoriteProvider[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: [], error: 'Not authenticated' }
        }

        const { data: favorites, error } = await supabase
            .from('preferred_suppliers')
            .select(`
                provider_id,
                notes,
                auto_notify_on_availability,
                created_at,
                provider_profiles (
                    id,
                    user_id,
                    day_rate,
                    currency,
                    headline,
                    is_active,
                    provider_ratings (
                        average_rating,
                        total_reviews
                    ),
                    profiles!provider_profiles_user_id_fkey (
                        full_name,
                        avatar_url
                    )
                )
            `)
            .eq('buyer_id', user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching favorites:', error)
            return { data: [], error: error.message }
        }

        // Map to FavoriteProvider format
        const favoriteProviders: FavoriteProvider[] = (favorites || []).map(fav => {
            const provider = fav.provider_profiles as {
                id: string
                user_id: string
                day_rate?: number
                currency: string
                headline?: string
                is_active: boolean
                provider_ratings?: { average_rating?: number; total_reviews?: number }
                profiles?: { full_name?: string; avatar_url?: string }
            } | null

            return {
                providerId: fav.provider_id,
                userId: provider?.user_id || '',
                name: provider?.profiles?.full_name || 'Provider',
                avatarUrl: provider?.profiles?.avatar_url,
                headline: provider?.headline,
                dayRate: provider?.day_rate,
                currency: provider?.currency || 'GBP',
                averageRating: provider?.provider_ratings?.average_rating,
                totalReviews: provider?.provider_ratings?.total_reviews || 0,
                isAvailable: provider?.is_active || false,
                addedAt: fav.created_at,
                notes: fav.notes,
                autoNotify: fav.auto_notify_on_availability
            }
        })

        return { data: favoriteProviders, error: null }
    } catch (err) {
        console.error('Failed to get favorite providers:', err)
        return { data: [], error: 'Failed to get favorites' }
    }
}

// ==========================================
// GET ORDER DETAIL
// ==========================================

export async function getOrderDetail(orderId: string): Promise<{
    data: OrderSummary | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                order_type,
                seller_id,
                listing_id,
                total_amount,
                currency,
                escrow_status,
                created_at,
                completed_at,
                marketplace_listings (
                    title,
                    category
                ),
                provider_profiles!orders_seller_id_fkey (
                    id,
                    user_id,
                    profiles!provider_profiles_user_id_fkey (
                        full_name,
                        avatar_url
                    )
                )
            `)
            .eq('id', orderId)
            .eq('buyer_id', user.id)
            .single()

        if (error || !order) {
            return { data: null, error: 'Order not found' }
        }

        // Get booked dates
        const { data: slots } = await supabase
            .from('availability_slots')
            .select('date')
            .eq('booking_id', orderId)
            .order('date', { ascending: true })

        // Get conversation
        const { data: conversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('order_id', orderId)
            .single()

        // Check for unread messages
        let hasUnreadMessages = false
        if (conversation) {
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conversation.id)
                .eq('is_read', false)
                .neq('sender_id', user.id)

            hasUnreadMessages = (count || 0) > 0
        }

        // Check if user has left a review
        const { data: review } = await supabase
            .from('reviews')
            .select('id')
            .eq('order_id', orderId)
            .eq('reviewer_id', user.id)
            .single()

        const orderSlots = slots?.map(s => s.date) || []
        const providerProfile = order.provider_profiles as {
            id: string
            user_id: string
            profiles: { full_name?: string; avatar_url?: string }
        } | null
        const listing = order.marketplace_listings as { title: string; category: string } | null

        const orderSummary: OrderSummary = {
            id: order.id,
            orderNumber: order.order_number,
            status: order.status as OrderSummary['status'],
            bookingType: order.order_type as OrderSummary['bookingType'],
            providerId: order.seller_id,
            providerName: providerProfile?.profiles?.full_name || 'Provider',
            providerAvatarUrl: providerProfile?.profiles?.avatar_url,
            listingId: order.listing_id,
            listingTitle: listing?.title || 'Booking',
            listingCategory: (listing?.category as OrderSummary['listingCategory']) || 'Services',
            startDate: orderSlots[0],
            endDate: orderSlots[orderSlots.length - 1],
            createdAt: order.created_at,
            completedAt: order.completed_at,
            totalAmount: order.total_amount,
            currency: order.currency,
            escrowStatus: order.escrow_status as OrderSummary['escrowStatus'],
            conversationId: conversation?.id,
            hasUnreadMessages,
            hasLeftReview: !!review
        }

        return { data: orderSummary, error: null }
    } catch (err) {
        console.error('Failed to get order detail:', err)
        return { data: null, error: 'Failed to get order' }
    }
}
