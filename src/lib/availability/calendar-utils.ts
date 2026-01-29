/**
 * Calendar Utility Functions
 * Helper functions for working with dates and availability calendars
 */

import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    addDays,
    isBefore,
    isAfter,
    isSameDay,
    isWithinInterval,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    parseISO,
    differenceInDays
} from 'date-fns'

import type { AvailabilityStatus, AvailabilitySlot } from '@/actions/availability'

/**
 * Date range representation
 */
export interface DateRange {
    start: Date
    end: Date
}

/**
 * Calendar day with metadata
 */
export interface CalendarDay {
    date: Date
    dateStr: string
    isCurrentMonth: boolean
    isToday: boolean
    isPast: boolean
    isFuture: boolean
    status: AvailabilityStatus | null
    isBooked: boolean
    isBlocked: boolean
    isAvailable: boolean
}

/**
 * Availability statistics
 */
export interface AvailabilityStats {
    total: number
    available: number
    booked: number
    blocked: number
    open: number // Days with no status set (treated as available)
    availabilityRate: number // Percentage of available days
}

/**
 * Get all dates in a month
 * @param year - The year
 * @param month - The month (0-11)
 * @returns Array of Date objects for each day in the month
 */
export function getMonthDates(year: number, month: number): Date[] {
    const monthDate = new Date(year, month, 1)
    const start = startOfMonth(monthDate)
    const end = endOfMonth(monthDate)
    
    return eachDayOfInterval({ start, end })
}

/**
 * Get calendar grid dates (includes days from adjacent months to fill the grid)
 * @param year - The year
 * @param month - The month (0-11)
 * @param weekStartsOn - Day the week starts on (0 = Sunday, 1 = Monday)
 * @returns Array of Date objects for the calendar grid
 */
export function getCalendarGridDates(
    year: number, 
    month: number, 
    weekStartsOn: 0 | 1 = 1
): Date[] {
    const monthDate = new Date(year, month, 1)
    const monthStart = startOfMonth(monthDate)
    const monthEnd = endOfMonth(monthDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })
    
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
}

/**
 * Check if a date is within a given range
 * @param date - The date to check
 * @param start - Start of the range
 * @param end - End of the range
 * @returns True if date is within range (inclusive)
 */
export function isDateInRange(date: Date | string, start: Date | string, end: Date | string): boolean {
    const checkDate = typeof date === 'string' ? parseISO(date) : date
    const rangeStart = typeof start === 'string' ? parseISO(start) : start
    const rangeEnd = typeof end === 'string' ? parseISO(end) : end
    
    return isWithinInterval(checkDate, { start: rangeStart, end: rangeEnd })
}

/**
 * Get the status of a specific date from availability slots
 * @param date - The date to check
 * @param slots - Map of date strings to availability slots
 * @returns The availability status or null if not set
 */
export function getDateStatus(
    date: Date | string, 
    slots: Record<string, AvailabilitySlot>
): AvailabilityStatus | null {
    const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
    return slots[dateStr]?.status || null
}

/**
 * Merge overlapping date ranges into consolidated ranges
 * @param ranges - Array of date ranges to merge
 * @returns Array of merged, non-overlapping date ranges
 */
export function mergeDateRanges(ranges: DateRange[]): DateRange[] {
    if (ranges.length === 0) return []
    
    // Sort by start date
    const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())
    
    const merged: DateRange[] = [sorted[0]]
    
    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i]
        const previous = merged[merged.length - 1]
        
        // Check if ranges overlap or are adjacent
        const dayAfterPrevious = addDays(previous.end, 1)
        
        if (isBefore(current.start, dayAfterPrevious) || isSameDay(current.start, dayAfterPrevious)) {
            // Merge: extend the previous range if current ends later
            if (isAfter(current.end, previous.end)) {
                previous.end = current.end
            }
        } else {
            // No overlap: add as new range
            merged.push(current)
        }
    }
    
    return merged
}

/**
 * Get dates from a range as an array
 * @param start - Start date
 * @param end - End date
 * @returns Array of dates in the range
 */
export function getDatesInRange(start: Date | string, end: Date | string): Date[] {
    const startDate = typeof start === 'string' ? parseISO(start) : start
    const endDate = typeof end === 'string' ? parseISO(end) : end
    
    if (isBefore(endDate, startDate)) {
        return []
    }
    
    return eachDayOfInterval({ start: startDate, end: endDate })
}

/**
 * Get dates as string array from a range
 * @param start - Start date
 * @param end - End date
 * @returns Array of date strings (YYYY-MM-DD format)
 */
export function getDateStringsInRange(start: Date | string, end: Date | string): string[] {
    return getDatesInRange(start, end).map(d => format(d, 'yyyy-MM-dd'))
}

/**
 * Get the next N days starting from a given date
 * @param startDate - The starting date (defaults to today)
 * @param days - Number of days to get
 * @returns Array of dates
 */
export function getNextNDays(startDate: Date = new Date(), days: number): Date[] {
    const dates: Date[] = []
    for (let i = 0; i < days; i++) {
        dates.push(addDays(startDate, i))
    }
    return dates
}

/**
 * Calculate availability statistics for a set of dates
 * @param dates - Array of dates to analyze
 * @param slots - Map of date strings to availability slots
 * @returns Statistics object
 */
export function calculateAvailabilityStats(
    dates: Date[],
    slots: Record<string, AvailabilitySlot>
): AvailabilityStats {
    const stats: AvailabilityStats = {
        total: dates.length,
        available: 0,
        booked: 0,
        blocked: 0,
        open: 0,
        availabilityRate: 0
    }
    
    dates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const slot = slots[dateStr]
        
        if (!slot) {
            stats.open++
        } else {
            switch (slot.status) {
                case 'available':
                    stats.available++
                    break
                case 'booked':
                    stats.booked++
                    break
                case 'blocked':
                    stats.blocked++
                    break
            }
        }
    })
    
    // Availability rate = (available + open) / (total - booked) * 100
    const nonBookedDays = stats.total - stats.booked
    if (nonBookedDays > 0) {
        stats.availabilityRate = ((stats.available + stats.open) / nonBookedDays) * 100
    }
    
    return stats
}

/**
 * Build calendar day objects with full metadata
 * @param dates - Array of dates
 * @param currentMonth - The current month being displayed
 * @param slots - Map of date strings to availability slots
 * @returns Array of CalendarDay objects
 */
export function buildCalendarDays(
    dates: Date[],
    currentMonth: Date,
    slots: Record<string, AvailabilitySlot>
): CalendarDay[] {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    return dates.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const slot = slots[dateStr]
        const status = slot?.status || null
        
        return {
            date,
            dateStr,
            isCurrentMonth: isSameMonth(date, currentMonth),
            isToday: isSameDay(date, today),
            isPast: isBefore(date, today),
            isFuture: isAfter(date, today),
            status,
            isBooked: status === 'booked',
            isBlocked: status === 'blocked',
            isAvailable: status === 'available' || status === null
        }
    })
}

/**
 * Find gaps in availability (unset or blocked dates) within a range
 * @param start - Start date
 * @param end - End date
 * @param slots - Map of date strings to availability slots
 * @returns Array of date ranges that are not available
 */
export function findAvailabilityGaps(
    start: Date,
    end: Date,
    slots: Record<string, AvailabilitySlot>
): DateRange[] {
    const dates = getDatesInRange(start, end)
    const gaps: DateRange[] = []
    let gapStart: Date | null = null
    
    dates.forEach((date, index) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const isUnavailable = slots[dateStr]?.status === 'blocked'
        
        if (isUnavailable) {
            if (!gapStart) {
                gapStart = date
            }
        } else if (gapStart) {
            // End of gap
            gaps.push({
                start: gapStart,
                end: dates[index - 1]
            })
            gapStart = null
        }
    })
    
    // Handle gap at the end
    if (gapStart) {
        gaps.push({
            start: gapStart,
            end: dates[dates.length - 1]
        })
    }
    
    return gaps
}

/**
 * Find consecutive available date ranges
 * @param start - Start date
 * @param end - End date  
 * @param slots - Map of date strings to availability slots
 * @returns Array of date ranges that are available
 */
export function findAvailableRanges(
    start: Date,
    end: Date,
    slots: Record<string, AvailabilitySlot>
): DateRange[] {
    const dates = getDatesInRange(start, end)
    const ranges: DateRange[] = []
    let rangeStart: Date | null = null
    
    dates.forEach((date, index) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const status = slots[dateStr]?.status
        const isAvailable = status === 'available' || !status
        
        if (isAvailable) {
            if (!rangeStart) {
                rangeStart = date
            }
        } else if (rangeStart) {
            // End of available range
            ranges.push({
                start: rangeStart,
                end: dates[index - 1]
            })
            rangeStart = null
        }
    })
    
    // Handle range at the end
    if (rangeStart) {
        ranges.push({
            start: rangeStart,
            end: dates[dates.length - 1]
        })
    }
    
    return ranges
}

/**
 * Check if a range of dates can be booked (all available)
 * @param dates - Array of dates to check
 * @param slots - Map of date strings to availability slots
 * @returns True if all dates are available for booking
 */
export function canBookDates(
    dates: Date[] | string[],
    slots: Record<string, AvailabilitySlot>
): boolean {
    return dates.every(date => {
        const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
        const status = slots[dateStr]?.status
        // Available if explicitly available or not set
        return status === 'available' || !status
    })
}

/**
 * Get booking duration in days
 * @param start - Start date
 * @param end - End date
 * @returns Number of days (inclusive)
 */
export function getBookingDuration(start: Date | string, end: Date | string): number {
    const startDate = typeof start === 'string' ? parseISO(start) : start
    const endDate = typeof end === 'string' ? parseISO(end) : end
    
    return differenceInDays(endDate, startDate) + 1
}

/**
 * Format a date range for display
 * @param range - The date range
 * @param formatStr - The date format string (defaults to 'MMM d, yyyy')
 * @returns Formatted string like "Jan 1, 2024 - Jan 5, 2024"
 */
export function formatDateRange(range: DateRange, formatStr: string = 'MMM d, yyyy'): string {
    const startStr = format(range.start, formatStr)
    const endStr = format(range.end, formatStr)
    
    if (isSameDay(range.start, range.end)) {
        return startStr
    }
    
    return `${startStr} - ${endStr}`
}
