'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface DiscoveryCallSettings {
    id: string
    provider_id: string
    is_enabled: boolean
    call_duration_minutes: number
    buffer_minutes: number
    max_advance_days: number
    min_notice_hours: number
    calendar_provider: 'google' | 'outlook' | 'apple' | 'manual' | null
    calendar_sync_enabled: boolean
    pre_call_questions: { question: string; required: boolean }[]
    confirmation_message: string | null
    reminder_hours_before: number
}

export interface DiscoveryCallSlot {
    id: string
    provider_id: string
    day_of_week: number // 0=Sunday
    start_time: string
    end_time: string
    is_active: boolean
}

export interface DiscoveryCall {
    id: string
    provider_id: string
    buyer_id: string
    scheduled_at: string
    duration_minutes: number
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
    meeting_url: string | null
    notes: string | null
    pre_call_answers: Record<string, string>
    buyer_feedback: string | null
    provider_feedback: string | null
    converted_to_order_id: string | null
    buyer_name?: string
    provider_name?: string
}

// Get provider's discovery call settings
export async function getDiscoveryCallSettings() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { settings: null, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { settings: null, error: 'Provider profile not found' }
    
    const { data, error } = await supabase
        .from('discovery_call_settings')
        .select('*')
        .eq('provider_id', provider.id)
        .single()
    
    if (error && error.code !== 'PGRST116') {
        return { settings: null, error: error.message }
    }
    
    return { settings: data as DiscoveryCallSettings | null, error: null }
}

// Update or create discovery call settings
export async function updateDiscoveryCallSettings(settings: Partial<Omit<DiscoveryCallSettings, 'id' | 'provider_id'>>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { success: false, error: 'Provider profile not found' }
    
    // Check if settings exist
    const { data: existing } = await supabase
        .from('discovery_call_settings')
        .select('id')
        .eq('provider_id', provider.id)
        .single()
    
    if (existing) {
        const { error } = await supabase
            .from('discovery_call_settings')
            .update({ ...settings, updated_at: new Date().toISOString() })
            .eq('provider_id', provider.id)
        
        if (error) return { success: false, error: error.message }
    } else {
        const { error } = await supabase
            .from('discovery_call_settings')
            .insert({ provider_id: provider.id, ...settings })
        
        if (error) return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/discovery-calls')
    return { success: true, error: null }
}

// Get provider's availability slots
export async function getDiscoveryCallSlots() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { slots: [], error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { slots: [], error: 'Provider profile not found' }
    
    const { data, error } = await supabase
        .from('discovery_call_slots')
        .select('*')
        .eq('provider_id', provider.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })
    
    return { slots: (data || []) as DiscoveryCallSlot[], error: error?.message || null }
}

// Add availability slot
export async function addDiscoveryCallSlot(slot: {
    day_of_week: number
    start_time: string
    end_time: string
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { success: false, error: 'Provider profile not found' }
    
    const { error } = await supabase
        .from('discovery_call_slots')
        .insert({
            provider_id: provider.id,
            ...slot
        })
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/discovery-calls')
    return { success: true, error: null }
}

// Remove availability slot
export async function removeDiscoveryCallSlot(slotId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    const { error } = await supabase
        .from('discovery_call_slots')
        .delete()
        .eq('id', slotId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/discovery-calls')
    return { success: true, error: null }
}

// Get available slots for a provider (public)
export async function getAvailableSlots(providerSlug: string, startDate: string, endDate: string) {
    const supabase = await createClient()
    
    // Get provider by slug
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .or(`profile_slug.eq.${providerSlug},username.eq.${providerSlug}`)
        .single()
    
    if (!provider) return { slots: [], error: 'Provider not found' }
    
    // Get settings
    const { data: settings } = await supabase
        .from('discovery_call_settings')
        .select('*')
        .eq('provider_id', provider.id)
        .single()
    
    if (!settings || !settings.is_enabled) {
        return { slots: [], error: 'Discovery calls not enabled' }
    }
    
    // Get weekly slots
    const { data: weeklySlots } = await supabase
        .from('discovery_call_slots')
        .select('*')
        .eq('provider_id', provider.id)
        .eq('is_active', true)
    
    // Get existing bookings in date range
    const { data: existingBookings } = await supabase
        .from('discovery_calls')
        .select('scheduled_at, duration_minutes')
        .eq('provider_id', provider.id)
        .gte('scheduled_at', startDate)
        .lte('scheduled_at', endDate)
        .in('status', ['scheduled', 'confirmed'])
    
    // Generate available time slots
    const availableSlots: { date: string; time: string; datetime: string }[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const minNotice = new Date()
    minNotice.setHours(minNotice.getHours() + settings.min_notice_hours)
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay()
        const daySlots = (weeklySlots || []).filter(s => s.day_of_week === dayOfWeek)
        
        for (const slot of daySlots) {
            const [startHour, startMin] = slot.start_time.split(':').map(Number)
            const [endHour, endMin] = slot.end_time.split(':').map(Number)
            
            // Generate slots at 30-minute intervals
            for (let h = startHour; h < endHour || (h === endHour && 0 < endMin); h++) {
                for (let m = (h === startHour ? startMin : 0); m < 60; m += 30) {
                    if (h === endHour && m >= endMin) break
                    
                    const slotDate = new Date(d)
                    slotDate.setHours(h, m, 0, 0)
                    
                    // Check if slot is in the future with enough notice
                    if (slotDate <= minNotice) continue
                    
                    // Check if slot is already booked
                    const isBooked = (existingBookings || []).some(booking => {
                        const bookingStart = new Date(booking.scheduled_at)
                        const bookingEnd = new Date(bookingStart)
                        bookingEnd.setMinutes(bookingEnd.getMinutes() + booking.duration_minutes)
                        
                        const slotEnd = new Date(slotDate)
                        slotEnd.setMinutes(slotEnd.getMinutes() + settings.call_duration_minutes)
                        
                        return slotDate < bookingEnd && slotEnd > bookingStart
                    })
                    
                    if (!isBooked) {
                        availableSlots.push({
                            date: slotDate.toISOString().split('T')[0],
                            time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
                            datetime: slotDate.toISOString()
                        })
                    }
                }
            }
        }
    }
    
    return { slots: availableSlots, error: null }
}

// Book a discovery call
export async function bookDiscoveryCall(input: {
    providerSlug: string
    scheduledAt: string
    preCallAnswers?: Record<string, string>
    notes?: string
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get provider by slug
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id, user_id')
        .or(`profile_slug.eq.${input.providerSlug},username.eq.${input.providerSlug}`)
        .single()
    
    if (!provider) return { success: false, error: 'Provider not found' }
    
    // Can't book with yourself
    if (provider.user_id === user.id) {
        return { success: false, error: 'Cannot book a call with yourself' }
    }
    
    // Get settings for duration
    const { data: settings } = await supabase
        .from('discovery_call_settings')
        .select('call_duration_minutes, is_enabled')
        .eq('provider_id', provider.id)
        .single()
    
    if (!settings?.is_enabled) {
        return { success: false, error: 'Provider does not accept discovery calls' }
    }
    
    // Create the booking
    const { data: booking, error } = await supabase
        .from('discovery_calls')
        .insert({
            provider_id: provider.id,
            buyer_id: user.id,
            scheduled_at: input.scheduledAt,
            duration_minutes: settings.call_duration_minutes,
            pre_call_answers: input.preCallAnswers || {},
            notes: input.notes,
            status: 'scheduled'
        })
        .select()
        .single()
    
    if (error) return { success: false, error: error.message }
    
    // TODO: Send notification to provider
    // TODO: Send calendar invite
    
    revalidatePath('/dashboard')
    return { success: true, bookingId: booking.id, error: null }
}

// Get discovery calls (for both provider and buyer)
export async function getDiscoveryCalls(role: 'provider' | 'buyer' = 'provider') {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { calls: [], error: 'Not authenticated' }
    
    let query = supabase.from('discovery_calls').select(`
        *,
        provider:provider_profiles!discovery_calls_provider_id_fkey (
            id,
            headline,
            profiles!provider_profiles_user_id_fkey (
                full_name,
                avatar_url
            )
        ),
        buyer:profiles!discovery_calls_buyer_id_fkey (
            id,
            full_name,
            avatar_url
        )
    `)
    
    if (role === 'provider') {
        // Get provider profile first
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()
        
        if (!provider) return { calls: [], error: 'Provider profile not found' }
        
        query = query.eq('provider_id', provider.id)
    } else {
        query = query.eq('buyer_id', user.id)
    }
    
    const { data, error } = await query.order('scheduled_at', { ascending: true })
    
    if (error) return { calls: [], error: error.message }
    
    return { calls: data || [], error: null }
}

// Update discovery call status
export async function updateDiscoveryCallStatus(callId: string, status: DiscoveryCall['status'], feedback?: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get the call and verify ownership
    const { data: call } = await supabase
        .from('discovery_calls')
        .select('buyer_id, provider_id, provider_profiles!inner(user_id)')
        .eq('id', callId)
        .single()
    
    if (!call) return { success: false, error: 'Call not found' }
    
    const isProvider = (call.provider_profiles as { user_id: string }).user_id === user.id
    const isBuyer = call.buyer_id === user.id
    
    if (!isProvider && !isBuyer) {
        return { success: false, error: 'Not authorized' }
    }
    
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    
    if (feedback) {
        if (isProvider) {
            updates.provider_feedback = feedback
        } else {
            updates.buyer_feedback = feedback
        }
    }
    
    if (status === 'cancelled') {
        updates.cancelled_by = user.id
    }
    
    const { error } = await supabase
        .from('discovery_calls')
        .update(updates)
        .eq('id', callId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/discovery-calls')
    revalidatePath('/dashboard')
    return { success: true, error: null }
}
