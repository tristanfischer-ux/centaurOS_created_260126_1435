/**
 * RFQ Timezone Scheduling
 * Handles fair timezone-aware broadcast scheduling
 */

import {
  ProviderBroadcastSchedule,
  SupplierTier,
  RACE_CONSTANTS,
} from '@/types/rfq'

/**
 * Calculate broadcast schedule for all providers
 * Ensures fair timing based on timezone (9am local) and tier
 */
export function calculateBroadcastSchedule(
  raceOpensAt: string,
  urgency: 'urgent' | 'standard',
  providers: Array<{
    provider_id: string
    timezone: string
    tier: SupplierTier
  }>
): ProviderBroadcastSchedule[] {
  const baseTime = new Date(raceOpensAt)
  const schedules: ProviderBroadcastSchedule[] = []

  for (const provider of providers) {
    let scheduledAt: Date
    let delaySeconds = 0

    if (urgency === 'urgent') {
      // Urgent: Immediate broadcast (with tier delay only)
      scheduledAt = new Date(baseTime)
      
      // Add tier delay for non-verified-partners
      if (provider.tier !== 'verified_partner') {
        delaySeconds = RACE_CONSTANTS.TIER_DELAY_MS / 1000
        scheduledAt = new Date(scheduledAt.getTime() + RACE_CONSTANTS.TIER_DELAY_MS)
      }
    } else {
      // Standard: Schedule for 9am in provider's timezone
      const broadcastWindow = getBroadcastWindow(provider.timezone, baseTime)
      scheduledAt = broadcastWindow

      // Add tier delay for non-verified-partners
      if (provider.tier !== 'verified_partner') {
        delaySeconds = RACE_CONSTANTS.TIER_DELAY_MS / 1000
        scheduledAt = new Date(scheduledAt.getTime() + RACE_CONSTANTS.TIER_DELAY_MS)
      }
    }

    schedules.push({
      provider_id: provider.provider_id,
      timezone: provider.timezone,
      scheduled_at: scheduledAt.toISOString(),
      local_time: formatLocalTime(scheduledAt, provider.timezone),
      tier: provider.tier,
      delay_seconds: delaySeconds,
    })
  }

  // Sort by scheduled time (earliest first)
  schedules.sort((a, b) => 
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )

  return schedules
}

/**
 * Get the broadcast window (9am local time) for a timezone
 */
export function getBroadcastWindow(
  timezone: string,
  baseDate: Date
): Date {
  try {
    // Get current time in the provider's timezone
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }

    const formatter = new Intl.DateTimeFormat('en-US', options)
    const parts = formatter.formatToParts(baseDate)
    
    const getPart = (type: Intl.DateTimeFormatPartTypes) => 
      parts.find(p => p.type === type)?.value || '0'

    const year = parseInt(getPart('year'))
    const month = parseInt(getPart('month')) - 1
    const day = parseInt(getPart('day'))
    const hour = parseInt(getPart('hour'))

    // Create 9am in that timezone
    // We need to find the UTC time that corresponds to 9am in the target timezone
    const targetHour = RACE_CONSTANTS.DEFAULT_BROADCAST_HOUR

    // If it's already past 9am in that timezone, schedule for next business day
    let targetDate = new Date(baseDate)
    if (hour >= targetHour) {
      // Schedule for tomorrow
      targetDate = new Date(year, month, day + 1)
    } else {
      targetDate = new Date(year, month, day)
    }

    // Skip weekends (optional - can be removed for 24/7 operation)
    const dayOfWeek = targetDate.getDay()
    if (dayOfWeek === 0) targetDate.setDate(targetDate.getDate() + 1) // Sunday -> Monday
    if (dayOfWeek === 6) targetDate.setDate(targetDate.getDate() + 2) // Saturday -> Monday

    // Calculate the UTC time for 9am in the target timezone
    const utcDate = getUTCTimeForLocalTime(targetDate, targetHour, timezone)
    
    return utcDate
  } catch {
    // Fallback to base date + 1 day at 9am UTC
    const fallback = new Date(baseDate)
    fallback.setDate(fallback.getDate() + 1)
    fallback.setHours(RACE_CONSTANTS.DEFAULT_BROADCAST_HOUR, 0, 0, 0)
    return fallback
  }
}

/**
 * Get UTC time for a specific local time in a timezone
 */
function getUTCTimeForLocalTime(
  date: Date,
  hour: number,
  timezone: string
): Date {
  try {
    // Create a date string for the target local time
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const localDateString = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00:00`

    // Get the offset for this timezone
    const tempDate = new Date(localDateString)
    const utcDate = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzDate = new Date(tempDate.toLocaleString('en-US', { timeZone: timezone }))
    const offset = tzDate.getTime() - utcDate.getTime()

    // Apply the offset to get UTC time
    return new Date(tempDate.getTime() - offset)
  } catch (error) {
    console.error('Error converting to UTC:', error)
    const result = new Date(date)
    result.setHours(hour, 0, 0, 0)
    return result
  }
}

/**
 * Format time for display in local timezone
 */
function formatLocalTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return date.toISOString()
  }
}

/**
 * Check if the race is currently open
 */
export function isRaceOpen(raceOpensAt: string | null): boolean {
  if (!raceOpensAt) return true // No scheduled time means it's open
  return new Date(raceOpensAt) <= new Date()
}

/**
 * Get time until race opens
 */
export function getTimeUntilRaceOpens(raceOpensAt: string | null): {
  isOpen: boolean
  timeUntilOpenMs: number | null
  formattedTime: string | null
} {
  if (!raceOpensAt) {
    return { isOpen: true, timeUntilOpenMs: null, formattedTime: null }
  }

  const openTime = new Date(raceOpensAt)
  const now = new Date()
  const diff = openTime.getTime() - now.getTime()

  if (diff <= 0) {
    return { isOpen: true, timeUntilOpenMs: null, formattedTime: null }
  }

  return {
    isOpen: false,
    timeUntilOpenMs: diff,
    formattedTime: formatDuration(diff),
  }
}

/**
 * Format a duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Get all timezones with their current offsets
 */
export function getCommonTimezones(): Array<{
  id: string
  label: string
  offset: string
}> {
  const timezones = [
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Hong_Kong',
    'Australia/Sydney',
  ]

  return timezones.map((tz) => {
    const now = new Date()
    const offset = getTimezoneOffset(now, tz)
    return {
      id: tz,
      label: tz.replace('_', ' ').replace('/', ' / '),
      offset: offset,
    }
  })
}

/**
 * Get formatted timezone offset
 */
function getTimezoneOffset(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(date)
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')
    return offsetPart?.value || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Check if a time is within business hours for a timezone
 */
export function isWithinBusinessHours(
  date: Date,
  timezone: string
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    })
    const hour = parseInt(formatter.format(date))
    
    return hour >= RACE_CONSTANTS.BUSINESS_HOURS_START && 
           hour < RACE_CONSTANTS.BUSINESS_HOURS_END
  } catch {
    return true // Default to true if we can't determine
  }
}
