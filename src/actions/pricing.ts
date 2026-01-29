"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ==========================================
// TYPES
// ==========================================

export type Currency = 'GBP' | 'EUR' | 'USD'

export interface PricingConfig {
    id: string
    providerId: string
    dayRate: number | null
    currency: Currency
    minimumDays: number
    // Retainer pricing
    retainerEnabled: boolean
    retainerHoursPerWeek: number | null
    retainerHourlyRate: number | null
    retainerDiscountPercent: number
    // Display info
    displayPrice: string
    displayRetainerPrice: string | null
}

export interface RetainerOption {
    hoursPerWeek: number
    hourlyRate: number
    weeklyTotal: number
    monthlyTotal: number
    savingsPercent: number
}

// ==========================================
// QUERIES
// ==========================================

/**
 * Get the current pricing configuration for a provider
 */
export async function getPricing(
    providerId: string
): Promise<{
    data: PricingConfig | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        const { data, error } = await supabase
            .from('provider_profiles')
            .select(`
                id,
                day_rate,
                currency,
                minimum_engagement_days,
                retainer_enabled,
                retainer_hours_per_week,
                retainer_hourly_rate,
                retainer_discount_percent
            `)
            .eq('id', providerId)
            .single()

        if (error) {
            console.error('Error fetching pricing:', error)
            return { data: null, error: error.message }
        }

        if (!data) {
            return { data: null, error: 'Provider not found' }
        }

        // Type cast to bypass generated type limitations
        const providerData = data as any

        const config: PricingConfig = {
            id: providerData.id,
            providerId: providerData.id,
            dayRate: providerData.day_rate,
            currency: (providerData.currency as Currency) || 'GBP',
            minimumDays: providerData.minimum_engagement_days || 1,
            retainerEnabled: providerData.retainer_enabled || false,
            retainerHoursPerWeek: providerData.retainer_hours_per_week,
            retainerHourlyRate: providerData.retainer_hourly_rate,
            retainerDiscountPercent: providerData.retainer_discount_percent || 0,
            displayPrice: formatPrice(providerData.day_rate, providerData.currency || 'GBP'),
            displayRetainerPrice: providerData.retainer_enabled && providerData.retainer_hourly_rate
                ? formatPrice(providerData.retainer_hourly_rate, providerData.currency || 'GBP', '/hr')
                : null
        }

        return { data: config, error: null }
    } catch (err) {
        console.error('Failed to fetch pricing:', err)
        return { data: null, error: 'Failed to fetch pricing' }
    }
}

/**
 * Get pricing for the currently logged-in provider
 */
export async function getMyPricing(): Promise<{
    data: PricingConfig | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        // Get provider profile ID
        const { data: profile } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (!profile) {
            return { data: null, error: 'Provider profile not found' }
        }

        return getPricing(profile.id)
    } catch (err) {
        console.error('Failed to fetch pricing:', err)
        return { data: null, error: 'Failed to fetch pricing' }
    }
}

/**
 * Get retainer pricing options for a provider
 */
export async function getRetainerOptions(
    providerId: string
): Promise<{
    data: RetainerOption[] | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        const { data, error } = await supabase
            .from('provider_profiles')
            .select(`
                day_rate,
                currency,
                retainer_enabled,
                retainer_hourly_rate,
                retainer_discount_percent
            `)
            .eq('id', providerId)
            .single()

        if (error || !data) {
            return { data: null, error: error?.message || 'Provider not found' }
        }

        // Type cast to bypass generated type limitations
        const providerData = data as any

        if (!providerData.retainer_enabled || !providerData.retainer_hourly_rate) {
            return { data: [], error: null }
        }

        // Calculate standard hourly rate from day rate (8 hours per day)
        const standardHourlyRate = providerData.day_rate ? providerData.day_rate / 8 : providerData.retainer_hourly_rate * 1.2
        const retainerRate = providerData.retainer_hourly_rate
        const savingsPercent = Math.round(((standardHourlyRate - retainerRate) / standardHourlyRate) * 100)

        // Generate retainer options
        const options: RetainerOption[] = [
            { hoursPerWeek: 8, hourlyRate: retainerRate, weeklyTotal: 8 * retainerRate, monthlyTotal: 8 * retainerRate * 4.33, savingsPercent },
            { hoursPerWeek: 16, hourlyRate: retainerRate, weeklyTotal: 16 * retainerRate, monthlyTotal: 16 * retainerRate * 4.33, savingsPercent },
            { hoursPerWeek: 24, hourlyRate: retainerRate, weeklyTotal: 24 * retainerRate, monthlyTotal: 24 * retainerRate * 4.33, savingsPercent },
            { hoursPerWeek: 32, hourlyRate: retainerRate, weeklyTotal: 32 * retainerRate, monthlyTotal: 32 * retainerRate * 4.33, savingsPercent },
            { hoursPerWeek: 40, hourlyRate: retainerRate, weeklyTotal: 40 * retainerRate, monthlyTotal: 40 * retainerRate * 4.33, savingsPercent },
        ]

        return { data: options, error: null }
    } catch (err) {
        console.error('Failed to fetch retainer options:', err)
        return { data: null, error: 'Failed to fetch retainer options' }
    }
}

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Update provider pricing configuration
 */
export async function updatePricing(pricing: {
    dayRate?: number | null
    currency?: Currency
    minimumDays?: number
    retainerEnabled?: boolean
    retainerHoursPerWeek?: number | null
    retainerHourlyRate?: number | null
    retainerDiscountPercent?: number
}): Promise<{
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
        if (pricing.dayRate !== undefined && pricing.dayRate !== null && pricing.dayRate < 0) {
            return { success: false, error: 'Day rate cannot be negative' }
        }

        if (pricing.minimumDays !== undefined && pricing.minimumDays < 1) {
            return { success: false, error: 'Minimum engagement must be at least 1 day' }
        }

        if (pricing.retainerHourlyRate !== undefined && pricing.retainerHourlyRate !== null && pricing.retainerHourlyRate < 0) {
            return { success: false, error: 'Retainer hourly rate cannot be negative' }
        }

        if (pricing.retainerDiscountPercent !== undefined && (pricing.retainerDiscountPercent < 0 || pricing.retainerDiscountPercent > 100)) {
            return { success: false, error: 'Discount percentage must be between 0 and 100' }
        }

        // Build update object
        const updateData: Record<string, unknown> = {}
        
        if (pricing.dayRate !== undefined) {
            updateData.day_rate = pricing.dayRate
        }
        if (pricing.currency !== undefined) {
            updateData.currency = pricing.currency
        }
        if (pricing.minimumDays !== undefined) {
            updateData.minimum_engagement_days = pricing.minimumDays
        }
        if (pricing.retainerEnabled !== undefined) {
            updateData.retainer_enabled = pricing.retainerEnabled
        }
        if (pricing.retainerHoursPerWeek !== undefined) {
            updateData.retainer_hours_per_week = pricing.retainerHoursPerWeek
        }
        if (pricing.retainerHourlyRate !== undefined) {
            updateData.retainer_hourly_rate = pricing.retainerHourlyRate
        }
        if (pricing.retainerDiscountPercent !== undefined) {
            updateData.retainer_discount_percent = pricing.retainerDiscountPercent
        }

        const { error } = await supabase
            .from('provider_profiles')
            .update(updateData)
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
 * Update only day rate pricing
 */
export async function updateDayRate(
    dayRate: number | null,
    currency: Currency
): Promise<{
    success: boolean
    error: string | null
}> {
    return updatePricing({ dayRate, currency })
}

/**
 * Update minimum engagement days
 */
export async function updateMinimumDays(
    minimumDays: number
): Promise<{
    success: boolean
    error: string | null
}> {
    return updatePricing({ minimumDays })
}

/**
 * Update retainer pricing options
 */
export async function updateRetainerPricing(
    enabled: boolean,
    hourlyRate: number | null,
    hoursPerWeek: number | null,
    discountPercent: number = 0
): Promise<{
    success: boolean
    error: string | null
}> {
    return updatePricing({
        retainerEnabled: enabled,
        retainerHourlyRate: hourlyRate,
        retainerHoursPerWeek: hoursPerWeek,
        retainerDiscountPercent: discountPercent
    })
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Format a price for display
 */
function formatPrice(
    amount: number | null, 
    currency: string, 
    suffix: string = '/day'
): string {
    if (amount === null) return 'Not set'
    
    const symbols: Record<string, string> = {
        GBP: '£',
        EUR: '€',
        USD: '$'
    }
    
    const symbol = symbols[currency] || '£'
    const formatted = amount.toLocaleString('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })
    
    return `${symbol}${formatted}${suffix}`
}

/**
 * Calculate effective hourly rate from day rate
 */
export async function calculateHourlyRate(dayRate: number, hoursPerDay: number = 8): Promise<number> {
    return dayRate / hoursPerDay
}

/**
 * Calculate total cost for an engagement
 */
export async function calculateEngagementCost(
    dayRate: number,
    days: number,
    currency: Currency = 'GBP'
): Promise<{
    total: number
    formatted: string
    breakdown: string
}> {
    const total = dayRate * days
    const symbols: Record<string, string> = {
        GBP: '£',
        EUR: '€',
        USD: '$'
    }
    const symbol = symbols[currency]
    
    return {
        total,
        formatted: `${symbol}${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
        breakdown: `${symbol}${dayRate.toLocaleString('en-GB')} × ${days} days`
    }
}

/**
 * Calculate retainer monthly cost
 */
export async function calculateRetainerCost(
    hourlyRate: number,
    hoursPerWeek: number,
    currency: Currency = 'GBP'
): Promise<{
    weekly: number
    monthly: number
    formatted: string
}> {
    const weekly = hourlyRate * hoursPerWeek
    const monthly = weekly * 4.33 // Average weeks per month
    
    const symbols: Record<string, string> = {
        GBP: '£',
        EUR: '€',
        USD: '$'
    }
    const symbol = symbols[currency]
    
    return {
        weekly,
        monthly,
        formatted: `${symbol}${monthly.toLocaleString('en-GB', { minimumFractionDigits: 2 })}/month`
    }
}

/**
 * Validate if a booking meets minimum engagement requirements
 */
export async function validateMinimumEngagement(
    providerId: string,
    numberOfDays: number
): Promise<{
    valid: boolean
    minimumDays: number
    error: string | null
}> {
    const { data: pricing } = await getPricing(providerId)
    
    if (!pricing) {
        return { valid: true, minimumDays: 1, error: null }
    }
    
    if (numberOfDays < pricing.minimumDays) {
        return {
            valid: false,
            minimumDays: pricing.minimumDays,
            error: `This provider requires a minimum engagement of ${pricing.minimumDays} days`
        }
    }
    
    return { valid: true, minimumDays: pricing.minimumDays, error: null }
}
