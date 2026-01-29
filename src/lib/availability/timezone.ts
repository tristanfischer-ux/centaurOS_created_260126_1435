/**
 * Time Zone Handling Utilities
 * Functions for converting and displaying dates across time zones
 * Uses native JavaScript Intl API - no external dependencies required
 */

import { format, parseISO } from 'date-fns'

// Common time zones with display labels
export const COMMON_TIMEZONES = [
    { value: 'Europe/London', label: 'London (GMT/BST)', offset: 'GMT' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)', offset: 'CET' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)', offset: 'CET' },
    { value: 'America/New_York', label: 'New York (EST/EDT)', offset: 'EST' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)', offset: 'PST' },
    { value: 'America/Chicago', label: 'Chicago (CST/CDT)', offset: 'CST' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 'JST' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 'SGT' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: 'GST' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)', offset: 'AEST' },
    { value: 'UTC', label: 'UTC', offset: 'UTC' },
] as const

export type TimezoneValue = typeof COMMON_TIMEZONES[number]['value'] | string

/**
 * Convert a date to a specific timezone using Intl API
 * @param date - The date to convert
 * @param timezone - The target timezone (IANA format, e.g., 'Europe/London')
 * @returns Date adjusted to represent the time in the target timezone
 */
export function convertToProviderTimezone(
    date: Date | string,
    providerTimezone: string
): Date {
    const inputDate = typeof date === 'string' ? parseISO(date) : date
    
    try {
        // Get the date string in the target timezone
        const options: Intl.DateTimeFormatOptions = {
            timeZone: providerTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }
        
        const formatter = new Intl.DateTimeFormat('en-CA', options)
        const parts = formatter.formatToParts(inputDate)
        
        const partMap: Record<string, string> = {}
        parts.forEach(part => {
            partMap[part.type] = part.value
        })
        
        // Construct a new date from the parts
        return new Date(
            parseInt(partMap.year),
            parseInt(partMap.month) - 1,
            parseInt(partMap.day),
            parseInt(partMap.hour),
            parseInt(partMap.minute),
            parseInt(partMap.second)
        )
    } catch {
        console.warn(`Invalid timezone: ${providerTimezone}, using original date`)
        return inputDate
    }
}

/**
 * Get the current time in a provider's timezone
 * @param providerId - Not used directly, just for API consistency
 * @param timezone - The provider's timezone
 * @returns Current date/time formatted for display
 */
export function getProviderLocalTime(timezone: string): {
    date: Date
    formatted: string
    timeString: string
} {
    const now = new Date()
    const localTime = convertToProviderTimezone(now, timezone)
    
    return {
        date: localTime,
        formatted: localTime.toLocaleString('en-GB', { timeZone: timezone }),
        timeString: localTime.toLocaleTimeString('en-GB', { 
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit'
        })
    }
}

/**
 * Format a date for display in a specific timezone
 * @param date - The date to format
 * @param timezone - The timezone to display in
 * @param formatOptions - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDateForTimezone(
    date: Date | string,
    timezone: string,
    formatOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }
): string {
    const inputDate = typeof date === 'string' ? parseISO(date) : date
    
    try {
        return inputDate.toLocaleString('en-GB', {
            ...formatOptions,
            timeZone: timezone
        })
    } catch {
        // Fallback to regular format if timezone is invalid
        return format(inputDate, 'dd MMM yyyy, HH:mm')
    }
}

/**
 * Get timezone offset in hours from UTC
 * @param timezone - The timezone
 * @param date - Optional date (some timezones have different offsets due to DST)
 * @returns Offset in hours (e.g., -5 for EST, +1 for CET)
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
    try {
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
        return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60)
    } catch {
        return 0
    }
}

/**
 * Format timezone offset for display
 * @param timezone - The timezone
 * @param date - Optional date for DST calculation
 * @returns Formatted offset string (e.g., "GMT+1", "GMT-5")
 */
export function formatTimezoneOffset(timezone: string, date: Date = new Date()): string {
    const offset = getTimezoneOffset(timezone, date)
    
    if (offset === 0) return 'GMT'
    
    const sign = offset > 0 ? '+' : '-'
    const hours = Math.floor(Math.abs(offset))
    const minutes = Math.round((Math.abs(offset) % 1) * 60)
    
    if (minutes === 0) {
        return `GMT${sign}${hours}`
    }
    
    return `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Get display label for a timezone
 * @param timezone - The timezone value
 * @returns Human-readable label
 */
export function getTimezoneLabel(timezone: string): string {
    const found = COMMON_TIMEZONES.find(tz => tz.value === timezone)
    
    if (found) {
        return found.label
    }
    
    // Format unknown timezones nicely
    return timezone.replace(/_/g, ' ').replace(/\//g, ' / ')
}

/**
 * Detect user's local timezone
 * @returns IANA timezone string
 */
export function detectUserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
        return 'UTC'
    }
}

/**
 * Check if a timezone is valid
 * @param timezone - The timezone to check
 * @returns True if valid IANA timezone
 */
export function isValidTimezone(timezone: string): boolean {
    try {
        new Date().toLocaleString('en-US', { timeZone: timezone })
        return true
    } catch {
        return false
    }
}

/**
 * Get the date portion adjusted for timezone (useful for availability calendars)
 * A date in one timezone might be a different day in another timezone
 * @param date - The date in UTC
 * @param timezone - The target timezone
 * @returns Date string (YYYY-MM-DD) in the target timezone
 */
export function getDateInTimezone(date: Date | string, timezone: string): string {
    const inputDate = typeof date === 'string' ? parseISO(date) : date
    
    try {
        const parts = inputDate.toLocaleDateString('en-CA', { timeZone: timezone }).split('-')
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    } catch {
        return format(inputDate, 'yyyy-MM-dd')
    }
}

/**
 * Display time with timezone abbreviation
 * @param date - The date to display
 * @param timezone - The timezone
 * @returns Formatted time with timezone (e.g., "2:30 PM GMT")
 */
export function formatTimeWithTimezone(
    date: Date | string,
    timezone: string
): string {
    const inputDate = typeof date === 'string' ? parseISO(date) : date
    
    try {
        return inputDate.toLocaleTimeString('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        })
    } catch {
        return format(inputDate, 'HH:mm')
    }
}

/**
 * Get business hours in provider's timezone
 * Useful for showing when a provider is typically available
 * @param timezone - The provider's timezone
 * @param businessStartHour - Start of business hours (default 9)
 * @param businessEndHour - End of business hours (default 17)
 * @returns Object with start and end times formatted for display
 */
export function getBusinessHoursInTimezone(
    timezone: string,
    businessStartHour: number = 9,
    businessEndHour: number = 17
): { start: string; end: string; inBusinessHours: boolean } {
    const now = convertToProviderTimezone(new Date(), timezone)
    const currentHour = now.getHours()
    
    const start = `${businessStartHour.toString().padStart(2, '0')}:00`
    const end = `${businessEndHour.toString().padStart(2, '0')}:00`
    
    return {
        start,
        end,
        inBusinessHours: currentHour >= businessStartHour && currentHour < businessEndHour
    }
}

/**
 * Calculate time difference between two timezones
 * @param tz1 - First timezone
 * @param tz2 - Second timezone
 * @param date - Optional reference date
 * @returns Difference in hours (positive if tz2 is ahead of tz1)
 */
export function getTimezoneDifference(
    tz1: string,
    tz2: string,
    date: Date = new Date()
): number {
    const offset1 = getTimezoneOffset(tz1, date)
    const offset2 = getTimezoneOffset(tz2, date)
    
    return offset2 - offset1
}

/**
 * Format timezone difference for display
 * @param userTz - User's timezone
 * @param providerTz - Provider's timezone
 * @param date - Optional reference date
 * @returns Human-readable difference (e.g., "5 hours behind you")
 */
export function formatTimezoneDifference(
    userTz: string,
    providerTz: string,
    date: Date = new Date()
): string {
    const diff = getTimezoneDifference(userTz, providerTz, date)
    
    if (diff === 0) {
        return 'Same timezone as you'
    }
    
    const hours = Math.abs(diff)
    const direction = diff > 0 ? 'ahead of' : 'behind'
    const hourLabel = hours === 1 ? 'hour' : 'hours'
    
    return `${hours} ${hourLabel} ${direction} you`
}

/**
 * Get the current date in a specific timezone as a string
 * @param timezone - Target timezone
 * @returns Date string (YYYY-MM-DD)
 */
export function getTodayInTimezone(timezone: string): string {
    return getDateInTimezone(new Date(), timezone)
}

/**
 * Format a date for display showing both local and provider time
 * @param date - The date
 * @param providerTz - Provider's timezone
 * @param userTz - User's timezone (optional, defaults to local)
 * @returns Formatted string showing both times
 */
export function formatDualTimezone(
    date: Date | string,
    providerTz: string,
    userTz?: string
): { providerTime: string; userTime: string } {
    const inputDate = typeof date === 'string' ? parseISO(date) : date
    const actualUserTz = userTz || detectUserTimezone()
    
    return {
        providerTime: formatTimeWithTimezone(inputDate, providerTz),
        userTime: formatTimeWithTimezone(inputDate, actualUserTz)
    }
}
