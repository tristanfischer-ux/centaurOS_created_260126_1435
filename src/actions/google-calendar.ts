/**
 * @file google-calendar.ts
 *
 * @description Server actions for syncing ForgeOS entities to Google Calendar.
 * Provides push-sync for tasks, discovery calls, and objectives.
 *
 * @security Requires authenticated user with Google Calendar scopes granted
 * @audit Calendar sync events are logged
 *
 * @related
 * - src/lib/google/calendar.ts - Google Calendar API wrapper
 * - src/lib/google/client.ts - Authenticated Google client factory
 * - src/actions/tasks.ts - Calls syncTaskToCalendar after task create/update
 * - src/actions/discovery-calls.ts - Calls syncDiscoveryCallToCalendar after booking
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getGoogleClient } from '@/lib/google/client'
import {
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    checkAvailability,
} from '@/lib/google/calendar'
import type { CalendarEventParams } from '@/lib/google/calendar'

/**
 * Sync a task's due dates to Google Calendar.
 * Creates or updates a calendar event for the task.
 *
 * @param taskId - The task ID
 * @param title - Task title
 * @param startDate - Task start date (ISO string, optional)
 * @param endDate - Task end/due date (ISO string)
 * @param description - Task description (optional)
 * @returns The Google Calendar event ID, or null if sync skipped/failed
 */
export async function syncTaskToCalendar(
    taskId: string,
    title: string,
    startDate: string | null,
    endDate: string | null,
    description?: string | null
): Promise<{ eventId: string | null; meetLink: string | null; error?: string }> {
    if (!endDate && !startDate) {
        return { eventId: null, meetLink: null }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { eventId: null, meetLink: null, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { eventId: null, meetLink: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        // User hasn't connected Google — silently skip
        return { eventId: null, meetLink: null }
    }

    // Check for existing sync mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from('calendar_sync_mappings')
        .select('google_event_id, google_calendar_id')
        .eq('user_id', user.id)
        .eq('entity_type', 'task')
        .eq('entity_id', taskId)
        .single()

    const eventParams: CalendarEventParams = {
        summary: `📋 ${title}`,
        description: description || undefined,
        startTime: startDate || endDate!,
        endTime: endDate || undefined,
        allDay: true, // Tasks are all-day events by default
        colorId: '6', // Tangerine — maps to the ForgeOS orange brand
    }

    if (existing?.google_event_id) {
        // Update existing event
        const result = await updateCalendarEvent(
            client,
            existing.google_event_id,
            eventParams,
            existing.google_calendar_id || 'primary'
        )

        if (result.success) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('calendar_sync_mappings')
                .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('entity_type', 'task')
                .eq('entity_id', taskId)
        }

        return { eventId: result.eventId || existing.google_event_id, meetLink: null }
    }

    // Create new event
    const result = await createCalendarEvent(client, eventParams)

    if (result.success && result.eventId) {
        // Save sync mapping
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('calendar_sync_mappings')
            .insert({
                user_id: user.id,
                foundry_id: foundryId,
                entity_type: 'task',
                entity_id: taskId,
                google_calendar_id: 'primary',
                google_event_id: result.eventId,
                sync_direction: 'push',
            })

        console.info('[GoogleCalendar] Task synced to calendar:', {
            taskId,
            eventId: result.eventId,
            userId: user.id,
        })
    }

    return {
        eventId: result.eventId || null,
        meetLink: result.meetLink || null,
        error: result.error,
    }
}

/**
 * Sync a discovery call to Google Calendar with a Google Meet link.
 *
 * @param callId - The discovery call ID
 * @param scheduledAt - The scheduled time (ISO string)
 * @param durationMinutes - Call duration in minutes
 * @param providerName - Name of the provider
 * @param buyerName - Name of the buyer
 * @param providerEmail - Provider email (for attendee invite)
 * @param buyerEmail - Buyer email (for attendee invite)
 * @returns The Google Calendar event ID and Meet link
 */
export async function syncDiscoveryCallToCalendar(
    callId: string,
    scheduledAt: string,
    durationMinutes: number,
    providerName: string,
    buyerName: string,
    providerEmail?: string,
    buyerEmail?: string
): Promise<{ eventId: string | null; meetLink: string | null; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { eventId: null, meetLink: null, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { eventId: null, meetLink: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { eventId: null, meetLink: null }
    }

    // Calculate end time
    const startTime = new Date(scheduledAt)
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

    // Build attendee list
    const attendees: string[] = []
    if (providerEmail) attendees.push(providerEmail)
    if (buyerEmail) attendees.push(buyerEmail)

    const result = await createCalendarEvent(client, {
        summary: `Discovery Call: ${providerName} & ${buyerName}`,
        description: `Discovery call booked through ForgeOS.\n\nProvider: ${providerName}\nBuyer: ${buyerName}`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        addMeetLink: true,
        attendees,
        colorId: '7', // Peacock blue
    })

    if (result.success && result.eventId) {
        // Save sync mapping
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('calendar_sync_mappings')
            .insert({
                user_id: user.id,
                foundry_id: foundryId,
                entity_type: 'discovery_call',
                entity_id: callId,
                google_calendar_id: 'primary',
                google_event_id: result.eventId,
                sync_direction: 'push',
            })

        // Update the discovery call with the Meet link
        if (result.meetLink) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('discovery_calls')
                .update({ meeting_url: result.meetLink })
                .eq('id', callId)
        }

        console.info('[GoogleCalendar] Discovery call synced:', {
            callId,
            eventId: result.eventId,
            meetLink: result.meetLink,
        })
    }

    return {
        eventId: result.eventId || null,
        meetLink: result.meetLink || null,
        error: result.error,
    }
}

/**
 * Remove a calendar event when a ForgeOS entity is deleted.
 *
 * @param entityType - The type of entity
 * @param entityId - The entity ID
 * @returns Success status
 */
export async function removeCalendarSync(
    entityType: 'task' | 'discovery_call' | 'objective' | 'standup',
    entityId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { success: false, error: 'No active foundry' }

    // Find existing mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mapping } = await (supabase as any)
        .from('calendar_sync_mappings')
        .select('google_event_id, google_calendar_id')
        .eq('user_id', user.id)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single()

    if (!mapping) {
        return { success: true } // Nothing to remove
    }

    const client = await getGoogleClient(user.id, foundryId)
    if (client) {
        await deleteCalendarEvent(client, mapping.google_event_id, mapping.google_calendar_id || 'primary')
    }

    // Remove mapping regardless of whether the Google API call succeeded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
        .from('calendar_sync_mappings')
        .delete()
        .eq('user_id', user.id)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)

    return { success: true }
}

/**
 * Check calendar availability for a time range (current user).
 * Used when scheduling discovery calls.
 *
 * @param timeMin - Start of range (ISO string)
 * @param timeMax - End of range (ISO string)
 * @returns Busy time slots from Google Calendar
 */
export async function checkCalendarAvailability(
    timeMin: string,
    timeMax: string
): Promise<{ busy: Array<{ start: string; end: string }>; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { busy: [], error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { busy: [], error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { busy: [] } // No Google connection — return empty
    }

    return checkAvailability(client, timeMin, timeMax)
}

/**
 * Check a specific user's Google Calendar availability.
 * Used by getAvailableSlots to filter out provider's busy times.
 *
 * @description Looks up the provider's Google token via their profile,
 * then queries their calendar for busy times. Returns empty if the
 * provider hasn't connected Google — graceful degradation.
 *
 * @param providerUserId - The provider's user ID
 * @param timeMin - Start of range (ISO string)
 * @param timeMax - End of range (ISO string)
 * @returns Busy time slots, or empty array if provider has no Google connection
 *
 * @security Uses service-level Supabase client to read provider's foundry context
 */
export async function checkProviderCalendarAvailability(
    providerUserId: string,
    timeMin: string,
    timeMax: string
): Promise<Array<{ start: string; end: string }>> {
    try {
        const supabase = await createClient()

        // Look up provider's active foundry from their profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id, active_foundry_id')
            .eq('id', providerUserId)
            .single()

        if (!profile) return []

        const foundryId = profile.active_foundry_id || profile.foundry_id
        if (!foundryId) return []

        const client = await getGoogleClient(providerUserId, foundryId)
        if (!client) return [] // Provider hasn't connected Google — skip

        const result = await checkAvailability(client, timeMin, timeMax)
        return result.busy || []
    } catch (error) {
        // Non-critical: if anything fails, just don't filter by calendar
        console.warn('[GoogleCalendar] Failed to check provider availability:', {
            providerUserId,
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return []
    }
}
