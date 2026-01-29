"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ==========================================
// TYPES
// ==========================================

export type AvailabilityStatus = 'available' | 'booked' | 'blocked'
export type Currency = 'GBP' | 'EUR' | 'USD'

export interface AvailabilitySlot {
    id: string
    provider_id: string
    date: string
    status: AvailabilityStatus
    booking_id: string | null
    source: 'manual' | 'calendar_sync' | 'booking'
    created_at: string
}

export interface ProviderProfile {
    id: string
    user_id: string
    day_rate: number | null
    currency: string
    timezone: string
    max_concurrent_orders: number
    current_order_count: number
    auto_pause_at_capacity: boolean
    is_active: boolean
}

export interface PricingSettings {
    dayRate: number | null
    currency: Currency
    minimumDays: number
    maxConcurrentOrders: number
    autoPauseAtCapacity: boolean
}

// ==========================================
// AVAILABILITY QUERIES
// ==========================================

/**
 * Get the current user's provider profile
 */
export async function getProviderProfile(): Promise<{
    data: ProviderProfile | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const { data, error } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                // No profile found - not an error, user just isn't a provider yet
                return { data: null, error: null }
            }
            console.error('Error fetching provider profile:', error)
            return { data: null, error: error.message }
        }

        return { data: data as ProviderProfile, error: null }
    } catch (err) {
        console.error('Failed to fetch provider profile:', err)
        return { data: null, error: 'Failed to fetch provider profile' }
    }
}

/**
 * Get availability slots for a provider within a date range
 */
export async function getAvailability(
    providerId: string,
    startDate: string,
    endDate: string
): Promise<{
    data: AvailabilitySlot[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        const { data, error } = await supabase
            .from('availability_slots')
            .select('*')
            .eq('provider_id', providerId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })

        if (error) {
            console.error('Error fetching availability:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as AvailabilitySlot[], error: null }
    } catch (err) {
        console.error('Failed to fetch availability:', err)
        return { data: [], error: 'Failed to fetch availability' }
    }
}

/**
 * Get availability for a provider by user ID (useful for marketplace)
 */
export async function getProviderAvailabilityByUserId(
    userId: string,
    startDate: string,
    endDate: string
): Promise<{
    data: AvailabilitySlot[]
    profile: ProviderProfile | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // First get the provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (profileError || !profile) {
            return { data: [], profile: null, error: 'Provider profile not found' }
        }

        // Then get availability
        const { data, error } = await supabase
            .from('availability_slots')
            .select('*')
            .eq('provider_id', profile.id)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })

        if (error) {
            console.error('Error fetching availability:', error)
            return { data: [], profile: profile as ProviderProfile, error: error.message }
        }

        return { 
            data: (data || []) as AvailabilitySlot[], 
            profile: profile as ProviderProfile,
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch availability:', err)
        return { data: [], profile: null, error: 'Failed to fetch availability' }
    }
}

// ==========================================
// AVAILABILITY MUTATIONS
// ==========================================

/**
 * Set availability for a single day
 */
export async function setAvailability(
    date: string,
    status: 'available' | 'blocked'
): Promise<{
    success: boolean
    data: AvailabilitySlot | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, data: null, error: 'Not authenticated' }
        }

        // Get provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile) {
            return { success: false, data: null, error: 'Provider profile not found' }
        }

        // Check if slot already exists
        const { data: existingSlot } = await supabase
            .from('availability_slots')
            .select('*')
            .eq('provider_id', profile.id)
            .eq('date', date)
            .single()

        // If booked, don't allow changes
        if (existingSlot && existingSlot.status === 'booked') {
            return { success: false, data: null, error: 'Cannot modify booked dates' }
        }

        // Upsert the availability slot
        const { data, error } = await supabase
            .from('availability_slots')
            .upsert({
                provider_id: profile.id,
                date: date,
                status: status,
                source: 'manual'
            }, {
                onConflict: 'provider_id,date'
            })
            .select()
            .single()

        if (error) {
            console.error('Error setting availability:', error)
            return { success: false, data: null, error: error.message }
        }

        revalidatePath('/provider-portal/availability')
        return { success: true, data: data as AvailabilitySlot, error: null }
    } catch (err) {
        console.error('Failed to set availability:', err)
        return { success: false, data: null, error: 'Failed to set availability' }
    }
}

/**
 * Set availability for multiple days at once
 */
export async function bulkSetAvailability(
    dates: string[],
    status: 'available' | 'blocked'
): Promise<{
    success: boolean
    updated: number
    skipped: number
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, updated: 0, skipped: 0, error: 'Not authenticated' }
        }

        // Get provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile) {
            return { success: false, updated: 0, skipped: 0, error: 'Provider profile not found' }
        }

        // Get existing booked slots for these dates
        const { data: bookedSlots } = await supabase
            .from('availability_slots')
            .select('date')
            .eq('provider_id', profile.id)
            .eq('status', 'booked')
            .in('date', dates)

        const bookedDates = new Set((bookedSlots || []).map(s => s.date))
        const datesToUpdate = dates.filter(d => !bookedDates.has(d))

        if (datesToUpdate.length === 0) {
            return { 
                success: true, 
                updated: 0, 
                skipped: dates.length, 
                error: null 
            }
        }

        // Prepare upsert data
        const slotsToUpsert = datesToUpdate.map(date => ({
            provider_id: profile.id,
            date: date,
            status: status,
            source: 'manual' as const
        }))

        // Bulk upsert
        const { error } = await supabase
            .from('availability_slots')
            .upsert(slotsToUpsert, {
                onConflict: 'provider_id,date'
            })

        if (error) {
            console.error('Error bulk setting availability:', error)
            return { success: false, updated: 0, skipped: 0, error: error.message }
        }

        revalidatePath('/provider-portal/availability')
        return { 
            success: true, 
            updated: datesToUpdate.length, 
            skipped: bookedDates.size,
            error: null 
        }
    } catch (err) {
        console.error('Failed to bulk set availability:', err)
        return { success: false, updated: 0, skipped: 0, error: 'Failed to set availability' }
    }
}

/**
 * Toggle availability for a single date (convenient for clicking)
 */
export async function toggleAvailability(
    date: string,
    currentStatus: AvailabilityStatus | null
): Promise<{
    success: boolean
    newStatus: AvailabilityStatus
    error: string | null
}> {
    // If currently booked, can't toggle
    if (currentStatus === 'booked') {
        return { success: false, newStatus: 'booked', error: 'Cannot modify booked dates' }
    }

    // Toggle between available and blocked
    const newStatus: 'available' | 'blocked' = 
        currentStatus === 'available' ? 'blocked' : 'available'

    const result = await setAvailability(date, newStatus)
    
    return {
        success: result.success,
        newStatus: result.success ? newStatus : (currentStatus || 'blocked'),
        error: result.error
    }
}

// ==========================================
// PRICING MUTATIONS
// ==========================================

/**
 * Update provider pricing settings
 */
export async function updatePricing(
    dayRate: number | null,
    currency: Currency,
    minimumDays: number = 1
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Validate inputs
        if (dayRate !== null && dayRate < 0) {
            return { success: false, error: 'Day rate cannot be negative' }
        }

        if (minimumDays < 1) {
            return { success: false, error: 'Minimum days must be at least 1' }
        }

        const validCurrencies = ['GBP', 'EUR', 'USD']
        if (!validCurrencies.includes(currency)) {
            return { success: false, error: 'Invalid currency' }
        }

        // Update provider profile
        const { error } = await supabase
            .from('provider_profiles')
            .update({
                day_rate: dayRate,
                currency: currency
            })
            .eq('user_id', user.id)

        if (error) {
            console.error('Error updating pricing:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/pricing')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update pricing:', err)
        return { success: false, error: 'Failed to update pricing' }
    }
}

/**
 * Update capacity settings
 */
export async function updateCapacitySettings(
    maxConcurrentOrders: number,
    autoPauseAtCapacity: boolean
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        if (maxConcurrentOrders < 1) {
            return { success: false, error: 'Max concurrent orders must be at least 1' }
        }

        const { error } = await supabase
            .from('provider_profiles')
            .update({
                max_concurrent_orders: maxConcurrentOrders,
                auto_pause_at_capacity: autoPauseAtCapacity
            })
            .eq('user_id', user.id)

        if (error) {
            console.error('Error updating capacity settings:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/pricing')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update capacity settings:', err)
        return { success: false, error: 'Failed to update capacity settings' }
    }
}

/**
 * Create or get provider profile for current user
 */
export async function ensureProviderProfile(): Promise<{
    data: ProviderProfile | null
    isNew: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: null, isNew: false, error: 'Not authenticated' }
        }

        // Check if profile exists
        const { data: existing } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (existing) {
            return { data: existing as ProviderProfile, isNew: false, error: null }
        }

        // Create new profile
        const { data, error } = await supabase
            .from('provider_profiles')
            .insert({
                user_id: user.id,
                currency: 'GBP',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                max_concurrent_orders: 5,
                auto_pause_at_capacity: true
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating provider profile:', error)
            return { data: null, isNew: false, error: error.message }
        }

        return { data: data as ProviderProfile, isNew: true, error: null }
    } catch (err) {
        console.error('Failed to ensure provider profile:', err)
        return { data: null, isNew: false, error: 'Failed to create provider profile' }
    }
}
