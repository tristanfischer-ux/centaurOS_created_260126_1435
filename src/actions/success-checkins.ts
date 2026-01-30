'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface SuccessCheckin {
    id: string
    order_id: string
    retainer_id: string | null
    checkin_type: 'day_30' | 'day_60' | 'day_90' | 'quarterly' | 'custom'
    scheduled_for: string
    completed_at: string | null
    buyer_rating: number | null
    buyer_feedback: string | null
    seller_rating: number | null
    seller_feedback: string | null
    issues_raised: string | null
    action_items: { item: string; assignee: string; due_date?: string; completed?: boolean }[]
    continuation_confirmed: boolean | null
    scope_changes: string | null
}

// Get check-ins for an order
export async function getOrderCheckins(orderId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { checkins: [], error: 'Not authenticated' }
    
    // Verify order access
    const { data: order } = await supabase
        .from('orders')
        .select('buyer_id, provider_profiles!orders_seller_id_fkey(user_id)')
        .eq('id', orderId)
        .single()
    
    if (!order) return { checkins: [], error: 'Order not found' }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = (order.provider_profiles as { user_id: string })?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { checkins: [], error: 'Not authorized' }
    }
    
    const { data, error } = await supabase
        .from('success_checkins')
        .select('*')
        .eq('order_id', orderId)
        .order('scheduled_for', { ascending: true })
    
    return { checkins: (data || []) as SuccessCheckin[], error: error?.message || null }
}

// Get upcoming check-ins for provider
export async function getUpcomingCheckins() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { checkins: [], error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { checkins: [], error: 'Provider profile not found' }
    
    // Get checkins for provider's orders
    const { data, error } = await supabase
        .from('success_checkins')
        .select(`
            *,
            orders!inner (
                id,
                order_number,
                seller_id,
                buyer:profiles!orders_buyer_id_fkey (
                    full_name,
                    avatar_url
                )
            )
        `)
        .eq('orders.seller_id', provider.id)
        .is('completed_at', null)
        .gte('scheduled_for', new Date().toISOString().split('T')[0])
        .order('scheduled_for', { ascending: true })
        .limit(10)
    
    return { checkins: data || [], error: error?.message || null }
}

// Get upcoming check-ins for buyer
export async function getBuyerUpcomingCheckins() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { checkins: [], error: 'Not authenticated' }
    
    const { data, error } = await supabase
        .from('success_checkins')
        .select(`
            *,
            orders!inner (
                id,
                order_number,
                buyer_id,
                provider_profiles!orders_seller_id_fkey (
                    headline,
                    profiles!provider_profiles_user_id_fkey (
                        full_name,
                        avatar_url
                    )
                )
            )
        `)
        .eq('orders.buyer_id', user.id)
        .is('completed_at', null)
        .gte('scheduled_for', new Date().toISOString().split('T')[0])
        .order('scheduled_for', { ascending: true })
        .limit(10)
    
    return { checkins: data || [], error: error?.message || null }
}

// Submit check-in feedback
export async function submitCheckinFeedback(checkinId: string, feedback: {
    rating: number
    feedbackText?: string
    issuesRaised?: string
    actionItems?: { item: string; assignee: string; due_date?: string }[]
    continuationConfirmed?: boolean
    scopeChanges?: string
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get checkin and verify access
    const { data: checkin } = await supabase
        .from('success_checkins')
        .select(`
            *,
            orders!inner (
                buyer_id,
                provider_profiles!orders_seller_id_fkey (user_id)
            )
        `)
        .eq('id', checkinId)
        .single()
    
    if (!checkin) return { success: false, error: 'Check-in not found' }
    
    const order = checkin.orders as {
        buyer_id: string
        provider_profiles: { user_id: string }
    }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = order.provider_profiles?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { success: false, error: 'Not authorized' }
    }
    
    const updates: Record<string, unknown> = {}
    
    if (isBuyer) {
        updates.buyer_rating = feedback.rating
        updates.buyer_feedback = feedback.feedbackText
        updates.continuation_confirmed = feedback.continuationConfirmed
    } else {
        updates.seller_rating = feedback.rating
        updates.seller_feedback = feedback.feedbackText
    }
    
    if (feedback.issuesRaised) {
        updates.issues_raised = feedback.issuesRaised
    }
    
    if (feedback.actionItems) {
        updates.action_items = feedback.actionItems
    }
    
    if (feedback.scopeChanges) {
        updates.scope_changes = feedback.scopeChanges
    }
    
    // Check if both parties have submitted feedback
    const hasBuyerFeedback = isBuyer || checkin.buyer_rating !== null
    const hasSellerFeedback = isSeller || checkin.seller_rating !== null
    
    if (hasBuyerFeedback && hasSellerFeedback) {
        updates.completed_at = new Date().toISOString()
    }
    
    const { error } = await supabase
        .from('success_checkins')
        .update(updates)
        .eq('id', checkinId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/orders')
    revalidatePath('/provider-portal/orders')
    return { success: true, error: null }
}

// Create a custom check-in
export async function createCustomCheckin(input: {
    orderId: string
    scheduledFor: string
    notes?: string
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify order access
    const { data: order } = await supabase
        .from('orders')
        .select('buyer_id, provider_profiles!orders_seller_id_fkey(user_id)')
        .eq('id', input.orderId)
        .single()
    
    if (!order) return { success: false, error: 'Order not found' }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = (order.provider_profiles as { user_id: string })?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { success: false, error: 'Not authorized' }
    }
    
    const { error } = await supabase
        .from('success_checkins')
        .insert({
            order_id: input.orderId,
            checkin_type: 'custom',
            scheduled_for: input.scheduledFor
        })
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath(`/orders/${input.orderId}`)
    return { success: true, error: null }
}

// Update action item status
export async function updateActionItemStatus(checkinId: string, itemIndex: number, completed: boolean) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get checkin
    const { data: checkin } = await supabase
        .from('success_checkins')
        .select(`
            action_items,
            orders!inner (
                buyer_id,
                provider_profiles!orders_seller_id_fkey (user_id)
            )
        `)
        .eq('id', checkinId)
        .single()
    
    if (!checkin) return { success: false, error: 'Check-in not found' }
    
    const order = checkin.orders as {
        buyer_id: string
        provider_profiles: { user_id: string }
    }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = order.provider_profiles?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { success: false, error: 'Not authorized' }
    }
    
    const actionItems = (checkin.action_items || []) as { item: string; assignee: string; due_date?: string; completed?: boolean }[]
    
    if (itemIndex < 0 || itemIndex >= actionItems.length) {
        return { success: false, error: 'Invalid action item index' }
    }
    
    actionItems[itemIndex].completed = completed
    
    const { error } = await supabase
        .from('success_checkins')
        .update({ action_items: actionItems })
        .eq('id', checkinId)
    
    if (error) return { success: false, error: error.message }
    
    return { success: true, error: null }
}

// Get check-in completion rate stats
export async function getCheckinStats(role: 'buyer' | 'provider' = 'provider') {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { stats: null, error: 'Not authenticated' }
    
    let query = supabase.from('success_checkins').select(`
        id,
        completed_at,
        buyer_rating,
        seller_rating,
        orders!inner (buyer_id, seller_id)
    `)
    
    if (role === 'provider') {
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()
        
        if (!provider) return { stats: null, error: 'Provider profile not found' }
        
        query = query.eq('orders.seller_id', provider.id)
    } else {
        query = query.eq('orders.buyer_id', user.id)
    }
    
    const { data: checkins } = await query
    
    if (!checkins) return { stats: null, error: null }
    
    const total = checkins.length
    const completed = checkins.filter(c => c.completed_at).length
    const averageRating = role === 'provider'
        ? checkins.filter(c => c.buyer_rating).reduce((sum, c) => sum + (c.buyer_rating || 0), 0) / (checkins.filter(c => c.buyer_rating).length || 1)
        : checkins.filter(c => c.seller_rating).reduce((sum, c) => sum + (c.seller_rating || 0), 0) / (checkins.filter(c => c.seller_rating).length || 1)
    
    return {
        stats: {
            total,
            completed,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
            averageRating: averageRating.toFixed(1)
        },
        error: null
    }
}
