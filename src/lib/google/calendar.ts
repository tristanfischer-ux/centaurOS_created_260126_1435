/**
 * @file calendar.ts
 *
 * @description Google Calendar API wrapper for creating, updating, and deleting
 * calendar events. Supports Google Meet link generation via conferenceData.
 *
 * @dependencies googleapis
 *
 * @security
 * - All operations require a valid OAuth2 client with calendar scopes
 * - Foundry isolation enforced at the action layer before calling these functions
 *
 * @related
 * - src/lib/google/client.ts - Provides authenticated OAuth2 clients
 * - src/actions/google-calendar.ts - Server actions that call these functions
 */

import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

export interface CalendarEventParams {
    /** Event title */
    summary: string
    /** Event description (optional) */
    description?: string
    /** Start time as ISO string */
    startTime: string
    /** End time as ISO string. If not provided, defaults to 1 hour after start. */
    endTime?: string
    /** Whether this is an all-day event */
    allDay?: boolean
    /** Google Calendar ID (defaults to 'primary') */
    calendarId?: string
    /** Whether to auto-generate a Google Meet link */
    addMeetLink?: boolean
    /** Attendee email addresses */
    attendees?: string[]
    /** Color ID (1-11) for visual categorization */
    colorId?: string
}

export interface CalendarEventResult {
    success: boolean
    eventId?: string
    meetLink?: string
    htmlLink?: string
    error?: string
}

/**
 * Create a new event on a user's Google Calendar.
 *
 * @param client - Authenticated OAuth2 client
 * @param params - Event parameters
 * @returns Created event details including Meet link if requested
 */
export async function createCalendarEvent(
    client: OAuth2Client,
    params: CalendarEventParams
): Promise<CalendarEventResult> {
    const calendar = google.calendar({ version: 'v3', auth: client })

    const calendarId = params.calendarId || 'primary'

    // Build event body
    const eventBody: calendar_v3.Schema$Event = {
        summary: params.summary,
        description: params.description,
    }

    // Set start/end times
    if (params.allDay) {
        // All-day events use date (not dateTime)
        eventBody.start = { date: params.startTime.split('T')[0] }
        eventBody.end = {
            date: params.endTime
                ? params.endTime.split('T')[0]
                : params.startTime.split('T')[0],
        }
    } else {
        eventBody.start = {
            dateTime: params.startTime,
            timeZone: 'UTC',
        }
        eventBody.end = {
            dateTime: params.endTime || getDefaultEndTime(params.startTime),
            timeZone: 'UTC',
        }
    }

    // Add attendees if provided
    if (params.attendees && params.attendees.length > 0) {
        eventBody.attendees = params.attendees.map(email => ({ email }))
    }

    // Add Google Meet link if requested
    if (params.addMeetLink) {
        eventBody.conferenceData = {
            createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
        }
    }

    // Set color if provided
    if (params.colorId) {
        eventBody.colorId = params.colorId
    }

    try {
        const { data } = await calendar.events.insert({
            calendarId,
            requestBody: eventBody,
            conferenceDataVersion: params.addMeetLink ? 1 : 0,
            sendUpdates: params.attendees?.length ? 'all' : 'none',
        })

        return {
            success: true,
            eventId: data.id || undefined,
            meetLink: data.conferenceData?.entryPoints?.find(
                ep => ep.entryPointType === 'video'
            )?.uri || undefined,
            htmlLink: data.htmlLink || undefined,
        }
    } catch (err) {
        console.error('[GoogleCalendar] Failed to create event:', {
            summary: params.summary,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to create calendar event',
        }
    }
}

/**
 * Update an existing Google Calendar event.
 *
 * @param client - Authenticated OAuth2 client
 * @param eventId - The Google Calendar event ID to update
 * @param params - Updated event parameters
 * @param calendarId - Google Calendar ID (defaults to 'primary')
 * @returns Updated event details
 */
export async function updateCalendarEvent(
    client: OAuth2Client,
    eventId: string,
    params: Partial<CalendarEventParams>,
    calendarId: string = 'primary'
): Promise<CalendarEventResult> {
    const calendar = google.calendar({ version: 'v3', auth: client })

    const eventBody: calendar_v3.Schema$Event = {}

    if (params.summary) eventBody.summary = params.summary
    if (params.description !== undefined) eventBody.description = params.description

    if (params.startTime) {
        if (params.allDay) {
            eventBody.start = { date: params.startTime.split('T')[0] }
        } else {
            eventBody.start = { dateTime: params.startTime, timeZone: 'UTC' }
        }
    }

    if (params.endTime) {
        if (params.allDay) {
            eventBody.end = { date: params.endTime.split('T')[0] }
        } else {
            eventBody.end = { dateTime: params.endTime, timeZone: 'UTC' }
        }
    }

    try {
        const { data } = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: eventBody,
        })

        return {
            success: true,
            eventId: data.id || undefined,
            htmlLink: data.htmlLink || undefined,
        }
    } catch (err) {
        console.error('[GoogleCalendar] Failed to update event:', {
            eventId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to update calendar event',
        }
    }
}

/**
 * Delete a Google Calendar event.
 *
 * @param client - Authenticated OAuth2 client
 * @param eventId - The Google Calendar event ID to delete
 * @param calendarId - Google Calendar ID (defaults to 'primary')
 * @returns Success status
 */
export async function deleteCalendarEvent(
    client: OAuth2Client,
    eventId: string,
    calendarId: string = 'primary'
): Promise<{ success: boolean; error?: string }> {
    const calendar = google.calendar({ version: 'v3', auth: client })

    try {
        await calendar.events.delete({
            calendarId,
            eventId,
        })

        return { success: true }
    } catch (err) {
        console.error('[GoogleCalendar] Failed to delete event:', {
            eventId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to delete calendar event',
        }
    }
}

/**
 * Check a user's free/busy status for a given time range.
 * Used for availability checking when scheduling discovery calls.
 *
 * @param client - Authenticated OAuth2 client
 * @param timeMin - Start of the range (ISO string)
 * @param timeMax - End of the range (ISO string)
 * @param calendarId - Google Calendar ID (defaults to 'primary')
 * @returns Array of busy time ranges
 */
export async function checkAvailability(
    client: OAuth2Client,
    timeMin: string,
    timeMax: string,
    calendarId: string = 'primary'
): Promise<{ busy: Array<{ start: string; end: string }>; error?: string }> {
    const calendar = google.calendar({ version: 'v3', auth: client })

    try {
        const { data } = await calendar.freebusy.query({
            requestBody: {
                timeMin,
                timeMax,
                items: [{ id: calendarId }],
            },
        })

        const busySlots = data.calendars?.[calendarId]?.busy || []

        return {
            busy: busySlots.map(slot => ({
                start: slot.start || '',
                end: slot.end || '',
            })),
        }
    } catch (err) {
        console.error('[GoogleCalendar] Failed to check availability:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            busy: [],
            error: err instanceof Error ? err.message : 'Failed to check availability',
        }
    }
}

/**
 * Default end time: 1 hour after start.
 */
function getDefaultEndTime(startTime: string): string {
    const date = new Date(startTime)
    date.setHours(date.getHours() + 1)
    return date.toISOString()
}
