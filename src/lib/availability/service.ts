"use server"

/**
 * Availability Service
 * Business logic for checking, reserving, and releasing availability slots
 */

import { createClient } from "@/lib/supabase/server"
import { format, parseISO, eachDayOfInterval } from "date-fns"

export type BookingStatus = 'available' | 'booked' | 'blocked'

export interface AvailabilityCheckResult {
    isAvailable: boolean
    unavailableDates: string[]
    bookedDates: string[]
    blockedDates: string[]
}

export interface ReservationResult {
    success: boolean
    reservedDates: string[]
    failedDates: string[]
    error: string | null
}

/**
 * Check if specific dates are available for a provider
 * @param providerId - The provider's profile ID
 * @param dates - Array of dates to check (Date objects or YYYY-MM-DD strings)
 * @returns Result indicating availability status for each date
 */
export async function checkAvailability(
    providerId: string,
    dates: (Date | string)[]
): Promise<AvailabilityCheckResult> {
    const supabase = await createClient()
    
    // Convert dates to strings
    const dateStrings = dates.map(d => 
        typeof d === 'string' ? d : format(d, 'yyyy-MM-dd')
    )
    
    // Fetch existing slots for these dates
    const { data: slots, error } = await supabase
        .from('availability_slots')
        .select('date, status')
        .eq('provider_id', providerId)
        .in('date', dateStrings)
    
    if (error) {
        console.error('Error checking availability:', error)
        return {
            isAvailable: false,
            unavailableDates: dateStrings,
            bookedDates: [],
            blockedDates: []
        }
    }
    
    // Build lookup map
    const slotMap = new Map<string, BookingStatus>()
    slots?.forEach(slot => {
        slotMap.set(slot.date, slot.status as BookingStatus)
    })
    
    // Categorize dates
    const bookedDates: string[] = []
    const blockedDates: string[] = []
    const unavailableDates: string[] = []
    
    dateStrings.forEach(date => {
        const status = slotMap.get(date)
        
        if (status === 'booked') {
            bookedDates.push(date)
            unavailableDates.push(date)
        } else if (status === 'blocked') {
            blockedDates.push(date)
            unavailableDates.push(date)
        }
        // Note: 'available' or undefined (no slot) = available
    })
    
    return {
        isAvailable: unavailableDates.length === 0,
        unavailableDates,
        bookedDates,
        blockedDates
    }
}

/**
 * Check if a date range is fully available
 * @param providerId - The provider's profile ID
 * @param startDate - Start of the range
 * @param endDate - End of the range
 * @returns Result indicating availability
 */
export async function checkDateRangeAvailability(
    providerId: string,
    startDate: Date | string,
    endDate: Date | string
): Promise<AvailabilityCheckResult> {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate
    
    const dates = eachDayOfInterval({ start, end })
    return checkAvailability(providerId, dates)
}

/**
 * Reserve dates for a booking (marks them as booked)
 * This should be called when a booking is confirmed
 * @param providerId - The provider's profile ID
 * @param dates - Array of dates to reserve
 * @param bookingId - The booking ID to associate with these dates
 * @returns Result indicating which dates were reserved
 */
export async function reserveDates(
    providerId: string,
    dates: (Date | string)[],
    bookingId: string
): Promise<ReservationResult> {
    const supabase = await createClient()
    
    const dateStrings = dates.map(d => 
        typeof d === 'string' ? d : format(d, 'yyyy-MM-dd')
    )
    
    // First check availability
    const availability = await checkAvailability(providerId, dateStrings)
    
    if (!availability.isAvailable) {
        return {
            success: false,
            reservedDates: [],
            failedDates: availability.unavailableDates,
            error: `Cannot reserve dates: ${availability.unavailableDates.length} date(s) unavailable`
        }
    }
    
    // Prepare upsert data
    const slotsToUpsert = dateStrings.map(date => ({
        provider_id: providerId,
        date: date,
        status: 'booked' as const,
        booking_id: bookingId,
        source: 'booking' as const
    }))
    
    // Upsert all slots
    const { error } = await supabase
        .from('availability_slots')
        .upsert(slotsToUpsert, {
            onConflict: 'provider_id,date'
        })
    
    if (error) {
        console.error('Error reserving dates:', error)
        return {
            success: false,
            reservedDates: [],
            failedDates: dateStrings,
            error: error.message
        }
    }
    
    return {
        success: true,
        reservedDates: dateStrings,
        failedDates: [],
        error: null
    }
}

/**
 * Reserve a date range for a booking
 * @param providerId - The provider's profile ID
 * @param startDate - Start of the range
 * @param endDate - End of the range
 * @param bookingId - The booking ID
 * @returns Reservation result
 */
export async function reserveDateRange(
    providerId: string,
    startDate: Date | string,
    endDate: Date | string,
    bookingId: string
): Promise<ReservationResult> {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate
    
    const dates = eachDayOfInterval({ start, end })
    return reserveDates(providerId, dates, bookingId)
}

/**
 * Release dates from a booking (marks them as available again)
 * This should be called when a booking is cancelled
 * @param providerId - The provider's profile ID
 * @param bookingId - The booking ID whose dates should be released
 * @returns Result indicating which dates were released
 */
export async function releaseDates(
    providerId: string,
    bookingId: string
): Promise<{
    success: boolean
    releasedDates: string[]
    error: string | null
}> {
    const supabase = await createClient()
    
    // Find all slots for this booking
    const { data: slots, error: fetchError } = await supabase
        .from('availability_slots')
        .select('id, date')
        .eq('provider_id', providerId)
        .eq('booking_id', bookingId)
    
    if (fetchError) {
        console.error('Error finding booked slots:', fetchError)
        return {
            success: false,
            releasedDates: [],
            error: fetchError.message
        }
    }
    
    if (!slots || slots.length === 0) {
        return {
            success: true,
            releasedDates: [],
            error: null
        }
    }
    
    const slotIds = slots.map(s => s.id)
    const releasedDates = slots.map(s => s.date)
    
    // Update slots to available and remove booking reference
    const { error: updateError } = await supabase
        .from('availability_slots')
        .update({
            status: 'available',
            booking_id: null,
            source: 'manual'
        })
        .in('id', slotIds)
    
    if (updateError) {
        console.error('Error releasing slots:', updateError)
        return {
            success: false,
            releasedDates: [],
            error: updateError.message
        }
    }
    
    return {
        success: true,
        releasedDates,
        error: null
    }
}

/**
 * Release specific dates (not tied to a booking)
 * @param providerId - The provider's profile ID
 * @param dates - Dates to release (set to available)
 * @returns Result
 */
export async function releaseDatesByDate(
    providerId: string,
    dates: (Date | string)[]
): Promise<{
    success: boolean
    releasedDates: string[]
    error: string | null
}> {
    const supabase = await createClient()
    
    const dateStrings = dates.map(d => 
        typeof d === 'string' ? d : format(d, 'yyyy-MM-dd')
    )
    
    // Only release dates that aren't booked
    const { data: slots } = await supabase
        .from('availability_slots')
        .select('id, date, status')
        .eq('provider_id', providerId)
        .in('date', dateStrings)
    
    const bookedDates = new Set(
        slots?.filter(s => s.status === 'booked').map(s => s.date) || []
    )
    
    const datesToRelease = dateStrings.filter(d => !bookedDates.has(d))
    
    if (datesToRelease.length === 0) {
        return {
            success: true,
            releasedDates: [],
            error: null
        }
    }
    
    // Update or insert available slots
    const slotsToUpsert = datesToRelease.map(date => ({
        provider_id: providerId,
        date: date,
        status: 'available' as const,
        booking_id: null,
        source: 'manual' as const
    }))
    
    const { error } = await supabase
        .from('availability_slots')
        .upsert(slotsToUpsert, {
            onConflict: 'provider_id,date'
        })
    
    if (error) {
        console.error('Error releasing dates:', error)
        return {
            success: false,
            releasedDates: [],
            error: error.message
        }
    }
    
    return {
        success: true,
        releasedDates: datesToRelease,
        error: null
    }
}

/**
 * Get availability summary for a provider
 * @param providerId - The provider's profile ID
 * @param startDate - Start of period to summarize
 * @param endDate - End of period to summarize
 * @returns Summary statistics
 */
export async function getAvailabilitySummary(
    providerId: string,
    startDate: Date | string,
    endDate: Date | string
): Promise<{
    totalDays: number
    availableDays: number
    bookedDays: number
    blockedDays: number
    utilizationRate: number
    error: string | null
}> {
    const supabase = await createClient()
    
    const start = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd')
    const end = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd')
    
    // Calculate total days in range
    const startD = typeof startDate === 'string' ? parseISO(startDate) : startDate
    const endD = typeof endDate === 'string' ? parseISO(endDate) : endDate
    const totalDays = eachDayOfInterval({ start: startD, end: endD }).length
    
    // Fetch all slots in range
    const { data: slots, error } = await supabase
        .from('availability_slots')
        .select('status')
        .eq('provider_id', providerId)
        .gte('date', start)
        .lte('date', end)
    
    if (error) {
        console.error('Error fetching availability summary:', error)
        return {
            totalDays,
            availableDays: 0,
            bookedDays: 0,
            blockedDays: 0,
            utilizationRate: 0,
            error: error.message
        }
    }
    
    // Count by status
    let bookedDays = 0
    let blockedDays = 0
    let availableDays = 0
    
    slots?.forEach(slot => {
        switch (slot.status) {
            case 'booked':
                bookedDays++
                break
            case 'blocked':
                blockedDays++
                break
            case 'available':
                availableDays++
                break
        }
    })
    
    // Days without explicit slots are considered available
    const explicitDays = bookedDays + blockedDays + availableDays
    const implicitAvailable = totalDays - explicitDays
    availableDays += implicitAvailable
    
    // Utilization = booked / (booked + available) * 100
    const utilizableTotal = bookedDays + availableDays
    const utilizationRate = utilizableTotal > 0 
        ? (bookedDays / utilizableTotal) * 100 
        : 0
    
    return {
        totalDays,
        availableDays,
        bookedDays,
        blockedDays,
        utilizationRate: Math.round(utilizationRate * 10) / 10,
        error: null
    }
}

/**
 * Get next available dates for a provider
 * @param providerId - The provider's profile ID
 * @param numberOfDays - How many available days to find
 * @param startFrom - Start searching from this date (defaults to today)
 * @returns Array of available date strings
 */
export async function getNextAvailableDates(
    providerId: string,
    numberOfDays: number = 5,
    startFrom: Date = new Date()
): Promise<{
    dates: string[]
    error: string | null
}> {
    const supabase = await createClient()
    
    // Look ahead up to 90 days
    const searchEndDate = new Date(startFrom)
    searchEndDate.setDate(searchEndDate.getDate() + 90)
    
    const startStr = format(startFrom, 'yyyy-MM-dd')
    const endStr = format(searchEndDate, 'yyyy-MM-dd')
    
    // Get all slots in the search range
    const { data: slots, error } = await supabase
        .from('availability_slots')
        .select('date, status')
        .eq('provider_id', providerId)
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true })
    
    if (error) {
        console.error('Error finding available dates:', error)
        return { dates: [], error: error.message }
    }
    
    // Build unavailable set
    const unavailableDates = new Set<string>()
    slots?.forEach(slot => {
        if (slot.status === 'booked' || slot.status === 'blocked') {
            unavailableDates.add(slot.date)
        }
    })
    
    // Find available dates
    const availableDates: string[] = []
    const allDates = eachDayOfInterval({ start: startFrom, end: searchEndDate })
    
    for (const date of allDates) {
        if (availableDates.length >= numberOfDays) break
        
        const dateStr = format(date, 'yyyy-MM-dd')
        if (!unavailableDates.has(dateStr)) {
            availableDates.push(dateStr)
        }
    }
    
    return { dates: availableDates, error: null }
}

/**
 * Check if a provider has capacity for new bookings
 * Based on their max_concurrent_orders setting
 * @param providerId - The provider's profile ID
 * @returns Whether provider can accept new bookings
 */
export async function checkProviderCapacity(
    providerId: string
): Promise<{
    hasCapacity: boolean
    currentOrders: number
    maxOrders: number
    error: string | null
}> {
    const supabase = await createClient()
    
    // Get provider profile
    const { data: profile, error: profileError } = await supabase
        .from('provider_profiles')
        .select('max_concurrent_orders, current_order_count, auto_pause_at_capacity, is_active')
        .eq('id', providerId)
        .single()
    
    if (profileError) {
        return {
            hasCapacity: false,
            currentOrders: 0,
            maxOrders: 0,
            error: profileError.message
        }
    }
    
    if (!profile.is_active) {
        return {
            hasCapacity: false,
            currentOrders: profile.current_order_count || 0,
            maxOrders: profile.max_concurrent_orders || 0,
            error: 'Provider is not currently accepting orders'
        }
    }
    
    const currentOrders = profile.current_order_count || 0
    const maxOrders = profile.max_concurrent_orders || 5
    const hasCapacity = currentOrders < maxOrders
    
    return {
        hasCapacity,
        currentOrders,
        maxOrders,
        error: hasCapacity ? null : 'Provider is at maximum capacity'
    }
}
