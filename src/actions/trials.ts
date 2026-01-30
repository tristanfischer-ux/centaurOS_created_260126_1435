'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface TrialOrderInput {
    providerId: string
    listingId?: string
    trialDurationWeeks: number
    trialHoursPerWeek: number
    objectives?: string
    notes?: string
}

// Create a trial order
export async function createTrialOrder(input: TrialOrderInput) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, orderId: null, error: 'Not authenticated' }
    
    // Get provider details
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select(`
            id,
            user_id,
            day_rate,
            hourly_rate,
            currency,
            accepts_trial,
            trial_rate_discount
        `)
        .eq('id', input.providerId)
        .single()
    
    if (!provider) {
        return { success: false, orderId: null, error: 'Provider not found' }
    }
    
    if (!provider.accepts_trial) {
        return { success: false, orderId: null, error: 'Provider does not accept trial engagements' }
    }
    
    // Can't book with yourself
    if (provider.user_id === user.id) {
        return { success: false, orderId: null, error: 'Cannot book a trial with yourself' }
    }
    
    // Calculate trial pricing
    let baseRate = provider.hourly_rate || (provider.day_rate ? provider.day_rate / 8 : 100)
    
    // Apply trial discount if any
    if (provider.trial_rate_discount > 0) {
        baseRate = baseRate * (1 - provider.trial_rate_discount / 100)
    }
    
    const totalHours = input.trialDurationWeeks * input.trialHoursPerWeek
    const subtotal = baseRate * totalHours
    const platformFee = subtotal * 0.08
    const vatAmount = (subtotal + platformFee) * 0.20
    const totalAmount = subtotal + platformFee + vatAmount
    
    // Create the trial order
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            buyer_id: user.id,
            seller_id: provider.id,
            listing_id: input.listingId || null,
            order_type: 'trial',
            is_trial: true,
            trial_duration_weeks: input.trialDurationWeeks,
            trial_hours_per_week: input.trialHoursPerWeek,
            total_amount: totalAmount,
            platform_fee: platformFee,
            vat_amount: vatAmount,
            currency: provider.currency || 'GBP',
            status: 'pending',
            escrow_status: 'pending'
        })
        .select()
        .single()
    
    if (orderError) {
        return { success: false, orderId: null, error: orderError.message }
    }
    
    // Create a conversation for the trial
    await supabase.from('conversations').insert({
        order_id: order.id,
        buyer_id: user.id,
        seller_id: provider.user_id
    })
    
    revalidatePath('/orders')
    revalidatePath('/provider-portal/orders')
    return { success: true, orderId: order.id, error: null }
}

// Convert trial to full engagement
export async function convertTrialToFullEngagement(trialOrderId: string, engagementDetails: {
    hoursPerWeek: number
    durationMonths: number
    monthlyRate?: number
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, orderId: null, error: 'Not authenticated' }
    
    // Get the trial order
    const { data: trialOrder } = await supabase
        .from('orders')
        .select(`
            *,
            provider_profiles!orders_seller_id_fkey (
                id,
                user_id,
                day_rate,
                hourly_rate,
                currency
            )
        `)
        .eq('id', trialOrderId)
        .eq('is_trial', true)
        .single()
    
    if (!trialOrder) {
        return { success: false, orderId: null, error: 'Trial order not found' }
    }
    
    if (trialOrder.buyer_id !== user.id) {
        return { success: false, orderId: null, error: 'Not authorized' }
    }
    
    if (trialOrder.status !== 'completed') {
        return { success: false, orderId: null, error: 'Trial must be completed before conversion' }
    }
    
    const provider = trialOrder.provider_profiles as {
        id: string
        user_id: string
        day_rate: number | null
        hourly_rate: number | null
        currency: string
    }
    
    // Calculate full engagement pricing
    const baseRate = provider.hourly_rate || (provider.day_rate ? provider.day_rate / 8 : 100)
    const monthlyHours = engagementDetails.hoursPerWeek * 4
    const monthlySubtotal = engagementDetails.monthlyRate || (baseRate * monthlyHours)
    const totalMonths = engagementDetails.durationMonths
    const subtotal = monthlySubtotal * totalMonths
    const platformFee = subtotal * 0.08
    const vatAmount = (subtotal + platformFee) * 0.20
    const totalAmount = subtotal + platformFee + vatAmount
    
    // Create the retainer
    const { data: retainer, error: retainerError } = await supabase
        .from('retainers')
        .insert({
            buyer_id: user.id,
            seller_id: provider.id,
            weekly_hours: engagementDetails.hoursPerWeek,
            hourly_rate: baseRate,
            currency: provider.currency || 'GBP',
            status: 'pending'
        })
        .select()
        .single()
    
    if (retainerError) {
        return { success: false, orderId: null, error: retainerError.message }
    }
    
    // Create the order linked to retainer
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            buyer_id: user.id,
            seller_id: provider.id,
            listing_id: trialOrder.listing_id,
            order_type: 'people_booking',
            is_trial: false,
            converted_from_trial_id: trialOrderId,
            total_amount: totalAmount,
            platform_fee: platformFee,
            vat_amount: vatAmount,
            currency: provider.currency || 'GBP',
            status: 'pending',
            escrow_status: 'pending'
        })
        .select()
        .single()
    
    if (orderError) {
        return { success: false, orderId: null, error: orderError.message }
    }
    
    // Mark trial as converted
    await supabase
        .from('orders')
        .update({ trial_converted_at: new Date().toISOString() })
        .eq('id', trialOrderId)
    
    revalidatePath('/orders')
    revalidatePath('/provider-portal/orders')
    return { success: true, orderId: order.id, retainerId: retainer.id, error: null }
}

// Get trial orders for a user (buyer or provider)
export async function getTrialOrders(role: 'buyer' | 'provider' = 'buyer') {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { trials: [], error: 'Not authenticated' }
    
    let query = supabase
        .from('orders')
        .select(`
            *,
            provider_profiles!orders_seller_id_fkey (
                id,
                headline,
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                )
            ),
            buyer:profiles!orders_buyer_id_fkey (
                id,
                full_name,
                avatar_url
            )
        `)
        .eq('is_trial', true)
    
    if (role === 'buyer') {
        query = query.eq('buyer_id', user.id)
    } else {
        // Get provider profile first
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()
        
        if (!provider) return { trials: [], error: 'Provider profile not found' }
        
        query = query.eq('seller_id', provider.id)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    
    return { trials: data || [], error: error?.message || null }
}

// Get trial conversion rate stats
export async function getTrialConversionStats() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { stats: null, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { stats: null, error: 'Provider profile not found' }
    
    // Get all trials for this provider
    const { data: trials } = await supabase
        .from('orders')
        .select('id, status, trial_converted_at')
        .eq('seller_id', provider.id)
        .eq('is_trial', true)
    
    if (!trials) return { stats: null, error: null }
    
    const totalTrials = trials.length
    const completedTrials = trials.filter(t => t.status === 'completed').length
    const convertedTrials = trials.filter(t => t.trial_converted_at).length
    const activeTrials = trials.filter(t => ['pending', 'accepted', 'in_progress'].includes(t.status)).length
    
    const conversionRate = completedTrials > 0 
        ? Math.round((convertedTrials / completedTrials) * 100) 
        : 0
    
    return {
        stats: {
            totalTrials,
            completedTrials,
            convertedTrials,
            activeTrials,
            conversionRate
        },
        error: null
    }
}
