'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { createBulkNotifications } from '@/actions/notifications'

// ==========================================
// TYPES
// ==========================================

/** @description Valid event types for Guild events */
export type EventType = 'speed_networking' | 'workshop' | 'career_fair' | 'meetup' | 'summit'

/** @description Event format (in-person, online, or hybrid) */
export type EventFormat = 'in_person' | 'online' | 'hybrid'

/** @description RSVP status for event attendees */
export type AttendeeStatus = 'going' | 'maybe' | 'cancelled'

export interface GuildEvent {
    id: string
    foundry_id: string | null
    title: string
    description: string | null
    event_date: string
    event_type: EventType
    event_format: EventFormat
    event_url: string | null
    location_geo: string | null
    location_address: string | null
    is_executive_only: boolean
    max_attendees: number | null
    created_by: string | null
    created_at: string
    updated_at: string
    creator?: {
        id: string
        full_name: string | null
        role: string | null
    }
    attendee_count?: number
}

export interface EventAttendee {
    id: string
    event_id: string
    user_id: string
    status: AttendeeStatus
    checked_in_at: string | null
    rsvp_at: string
    profile?: {
        id: string
        full_name: string | null
        role: string | null
        avatar_url: string | null
    }
}

// ==========================================
// GUILD EVENTS CRUD
// ==========================================

/**
 * Create a new guild event.
 *
 * @description Creates an event visible to Guild members. Requires Executive or Founder role.
 * @param data - Event details including title, date, type, format, and location
 * @returns The created event or an error message
 *
 * @security Requires authenticated user with Executive or Founder role.
 * @audit Event creation is logged via Supabase audit trail.
 */
export async function createGuildEvent(data: {
    title: string
    description?: string
    eventDate: string
    eventType?: EventType
    eventFormat?: EventFormat
    eventUrl?: string
    locationGeo?: string
    locationAddress?: string
    isExecutiveOnly?: boolean
    maxAttendees?: number
}): Promise<{ data: GuildEvent | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        // AUTH: Verify user has Executive or Founder role (don't rely on UI-only enforcement)
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile?.role || !['Founder', 'Executive'].includes(profile.role)) {
            return { data: null, error: 'Only Executives and Founders can create events' }
        }

        const foundryId = await getFoundryIdCached()

        const { data: event, error } = await supabase
            .from('guild_events')
            .insert({
                foundry_id: foundryId,
                title: data.title.trim(),
                description: data.description?.trim() || null,
                event_date: data.eventDate,
                event_type: data.eventType || 'meetup',
                event_format: data.eventFormat || 'in_person',
                event_url: data.eventUrl?.trim() || null,
                location_geo: data.locationGeo || null,
                location_address: data.locationAddress || null,
                is_executive_only: data.isExecutiveOnly || false,
                max_attendees: data.maxAttendees || null,
                created_by: user.id
            })
            .select(`
                *,
                creator:profiles!guild_events_created_by_fkey(id, full_name, role)
            `)
            .single()

        if (error) {
            console.error('[GuildEvents] createGuildEvent failed:', error)
            return { data: null, error: sanitizeErrorMessage(error) }
        }

        // Notify guild members about the new event
        try {
            if (!foundryId) throw new Error('No foundry ID')
            // SECURITY: Don't notify Apprentices about executive-only events
            const notifyRoles = data.isExecutiveOnly
                ? ['Founder', 'Executive'] as const
                : ['Founder', 'Executive', 'Apprentice'] as const
            const { data: guildMembers } = await supabase
                .from('profiles')
                .select('id')
                .eq('foundry_id', foundryId)
                .in('role', notifyRoles)
                .neq('id', user.id)

            if (guildMembers && guildMembers.length > 0) {
                await createBulkNotifications({
                    userIds: guildMembers.map(m => m.id),
                    type: 'event_reminder',
                    title: `New Guild Event: ${data.title.trim()}`,
                    message: `A new ${data.eventType || 'meetup'} has been scheduled.`,
                    link: `/guild/events/${(event as GuildEvent).id}`,
                })
            }
        } catch (notifErr) {
            // Non-blocking: event was created, notification failure shouldn't fail the whole operation
            console.error('[GuildEvents] Failed to send event notifications:', notifErr)
        }

        revalidatePath('/guild')
        return { data: event as GuildEvent, error: null }
    } catch (err) {
        console.error('[GuildEvents] createGuildEvent exception:', err)
        return { data: null, error: 'Failed to create event' }
    }
}

/**
 * Get all guild events (respects RLS for executive-only visibility).
 *
 * @description Fetches guild events with optional upcoming/past filtering.
 * @param options - Optional filters: upcoming, past, limit
 * @returns Array of events or an error
 */
export async function getGuildEvents(options?: {
    upcoming?: boolean
    past?: boolean
    limit?: number
}): Promise<{ data: GuildEvent[]; error: string | null }> {
    try {
        const supabase = await createClient()

        // Past events should be ordered newest-first so limit gets the most recent
        const ascending = !options?.past
        let query = supabase
            .from('guild_events')
            .select(`
                *,
                creator:profiles!guild_events_created_by_fkey(id, full_name, role)
            `)
            .order('event_date', { ascending })

        const now = new Date().toISOString()

        if (options?.upcoming) {
            query = query.gte('event_date', now)
        }

        if (options?.past) {
            query = query.lt('event_date', now)
        }

        if (options?.limit) {
            query = query.limit(options.limit)
        }

        const { data, error } = await query

        if (error) {
            console.error('[GuildEvents] getGuildEvents failed:', error)
            return { data: [], error: sanitizeErrorMessage(error) }
        }

        return { data: (data || []) as GuildEvent[], error: null }
    } catch (err) {
        console.error('[GuildEvents] getGuildEvents exception:', err)
        return { data: [], error: 'Failed to fetch events' }
    }
}

/**
 * Get upcoming guild events for the widget.
 *
 * @param limit - Maximum number of events to return (default: 3)
 * @returns Array of upcoming events
 */
export async function getUpcomingGuildEvents(limit: number = 3): Promise<{ data: GuildEvent[]; error: string | null }> {
    return getGuildEvents({ upcoming: true, limit })
}

/**
 * Get a single guild event by ID.
 *
 * @param eventId - The event to fetch
 * @returns The event or null if not found
 */
export async function getGuildEvent(eventId: string): Promise<{ data: GuildEvent | null; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('guild_events')
            .select(`
                *,
                creator:profiles!guild_events_created_by_fkey(id, full_name, role)
            `)
            .eq('id', eventId)
            .single()

        if (error) {
            console.error('[GuildEvents] getGuildEvent failed:', error)
            return { data: null, error: sanitizeErrorMessage(error) }
        }

        return { data: data as GuildEvent, error: null }
    } catch (err) {
        console.error('[GuildEvents] getGuildEvent exception:', err)
        return { data: null, error: 'Failed to fetch event' }
    }
}

/**
 * Update a guild event.
 *
 * @description Updates event details. Only the creator or Founders can update.
 * @param eventId - The event to update
 * @param data - Fields to update
 * @returns Success status or error
 */
export async function updateGuildEvent(
    eventId: string,
    data: {
        title?: string
        description?: string
        eventDate?: string
        eventType?: EventType
        eventFormat?: EventFormat
        eventUrl?: string
        locationGeo?: string
        locationAddress?: string
        isExecutiveOnly?: boolean
        maxAttendees?: number
    }
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        // AUTH: Verify user is event creator or Founder/Executive in same foundry
        const { data: event } = await supabase
            .from('guild_events')
            .select('created_by, foundry_id')
            .eq('id', eventId)
            .single()

        if (!event) return { success: false, error: 'Event not found' }

        if (event.created_by !== user.id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, foundry_id')
                .eq('id', user.id)
                .single()

            const isFoundryAdmin = profile?.foundry_id === event.foundry_id && 
                profile?.role && ['Founder', 'Executive'].includes(profile.role)

            if (!isFoundryAdmin) {
                return { success: false, error: 'Not authorized to update this event' }
            }
        }

        const { error } = await supabase
            .from('guild_events')
            .update({
                ...(data.title && { title: data.title.trim() }),
                ...(data.description !== undefined && { description: data.description?.trim() || null }),
                ...(data.eventDate && { event_date: data.eventDate }),
                ...(data.eventType && { event_type: data.eventType }),
                ...(data.eventFormat && { event_format: data.eventFormat }),
                ...(data.eventUrl !== undefined && { event_url: data.eventUrl?.trim() || null }),
                ...(data.locationGeo !== undefined && { location_geo: data.locationGeo || null }),
                ...(data.locationAddress !== undefined && { location_address: data.locationAddress || null }),
                ...(data.isExecutiveOnly !== undefined && { is_executive_only: data.isExecutiveOnly }),
                ...(data.maxAttendees !== undefined && { max_attendees: data.maxAttendees || null }),
                updated_at: new Date().toISOString()
            })
            .eq('id', eventId)

        if (error) {
            console.error('[GuildEvents] updateGuildEvent failed:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }

        revalidatePath('/guild')
        return { success: true, error: null }
    } catch (err) {
        console.error('[GuildEvents] updateGuildEvent exception:', err)
        return { success: false, error: 'Failed to update event' }
    }
}

/**
 * Delete a guild event.
 *
 * @param eventId - The event to delete
 * @returns Success status or error
 */
export async function deleteGuildEvent(eventId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        // AUTH: Verify user is event creator or Founder/Executive in same foundry
        const { data: event } = await supabase
            .from('guild_events')
            .select('created_by, foundry_id')
            .eq('id', eventId)
            .single()

        if (!event) return { success: false, error: 'Event not found' }

        if (event.created_by !== user.id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, foundry_id')
                .eq('id', user.id)
                .single()

            const isFoundryAdmin = profile?.foundry_id === event.foundry_id && 
                profile?.role && ['Founder', 'Executive'].includes(profile.role)

            if (!isFoundryAdmin) {
                return { success: false, error: 'Not authorized to delete this event' }
            }
        }

        const { error } = await supabase
            .from('guild_events')
            .delete()
            .eq('id', eventId)

        if (error) {
            console.error('[GuildEvents] deleteGuildEvent failed:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }

        revalidatePath('/guild')
        return { success: true, error: null }
    } catch (err) {
        console.error('[GuildEvents] deleteGuildEvent exception:', err)
        return { success: false, error: 'Failed to delete event' }
    }
}

// ==========================================
// RSVP / ATTENDEE MANAGEMENT
// ==========================================

/**
 * Toggle RSVP for the current user on an event.
 *
 * @description If already RSVP'd, cancels the RSVP. If not, creates one.
 * Checks event capacity before allowing new RSVPs.
 *
 * @param eventId - The event to RSVP to
 * @returns Whether the user is now attending, the updated count, or an error
 *
 * @security Requires authenticated user. RLS on event_attendees enforces
 * that users can only manage their own RSVPs.
 */
export async function toggleRSVP(eventId: string): Promise<{
    attending: boolean
    attendeeCount: number
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { attending: false, attendeeCount: 0, error: 'Not authenticated' }

        // Check if already RSVP'd
        const { data: existing } = await supabase
            .from('event_attendees')
            .select('id, status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (existing && existing.status === 'going') {
            // Cancel RSVP
            await supabase
                .from('event_attendees')
                .delete()
                .eq('id', existing.id)
        } else if (existing) {
            // Re-activate cancelled RSVP
            await supabase
                .from('event_attendees')
                .update({ status: 'going', updated_at: new Date().toISOString() })
                .eq('id', existing.id)
        } else {
            // SECURITY: Check capacity before inserting
            // NOTE: This check + insert is not fully atomic. A database constraint
            // or RPC function would be ideal. We mitigate by re-checking after insert.
            const { data: event } = await supabase
                .from('guild_events')
                .select('max_attendees')
                .eq('id', eventId)
                .single()

            if (event?.max_attendees) {
                const { count } = await supabase
                    .from('event_attendees')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', eventId)
                    .eq('status', 'going')

                if (count !== null && count >= event.max_attendees) {
                    return { attending: false, attendeeCount: count, error: 'Event is at capacity' }
                }
            }

            // Create new RSVP
            const { error: insertError } = await supabase
                .from('event_attendees')
                .insert({ event_id: eventId, user_id: user.id, status: 'going' })

            if (insertError) {
                console.error('[GuildEvents] toggleRSVP insert failed:', insertError)
                return { attending: false, attendeeCount: 0, error: sanitizeErrorMessage(insertError) }
            }

            // SECURITY: Post-insert capacity re-check to mitigate race conditions
            // If we exceeded capacity due to concurrent RSVPs, roll back our insert
            if (event?.max_attendees) {
                const { count: postInsertCount } = await supabase
                    .from('event_attendees')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', eventId)
                    .eq('status', 'going')

                if (postInsertCount !== null && postInsertCount > event.max_attendees) {
                    // Roll back: delete our RSVP since capacity was exceeded
                    await supabase
                        .from('event_attendees')
                        .delete()
                        .eq('event_id', eventId)
                        .eq('user_id', user.id)

                    return { attending: false, attendeeCount: event.max_attendees, error: 'Event is at capacity' }
                }
            }
        }

        // Get updated count
        const { count: newCount } = await supabase
            .from('event_attendees')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'going')

        const isNowAttending = !existing || existing.status !== 'going'

        revalidatePath('/guild')
        return { attending: isNowAttending, attendeeCount: newCount || 0, error: null }
    } catch (err) {
        console.error('[GuildEvents] toggleRSVP exception:', err)
        return { attending: false, attendeeCount: 0, error: 'Failed to update RSVP' }
    }
}

/**
 * Set explicit RSVP status for an event (going, maybe, or cancelled).
 *
 * @description Unlike toggleRSVP which toggles going/cancelled, this sets an explicit
 * status including 'maybe'. Checks capacity for 'going' status.
 *
 * @param eventId - The event to RSVP to
 * @param status - The desired RSVP status
 * @returns Updated status and counts
 */
export async function setRSVPStatus(
    eventId: string,
    status: 'going' | 'maybe' | 'cancelled'
): Promise<{
    status: 'going' | 'maybe' | 'cancelled'
    goingCount: number
    maybeCount: number
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { status: 'cancelled', goingCount: 0, maybeCount: 0, error: 'Not authenticated' }

        // Check existing RSVP
        const { data: existing } = await supabase
            .from('event_attendees')
            .select('id, status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (status === 'cancelled') {
            // Remove RSVP
            if (existing) {
                await supabase.from('event_attendees').delete().eq('id', existing.id)
            }
        } else if (existing) {
            // Update existing RSVP
            if (status === 'going' && existing.status !== 'going') {
                // Check capacity before switching to going
                const { data: event } = await supabase
                    .from('guild_events')
                    .select('max_attendees')
                    .eq('id', eventId)
                    .single()

                if (event?.max_attendees) {
                    const { count } = await supabase
                        .from('event_attendees')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', eventId)
                        .eq('status', 'going')

                    if (count !== null && count >= event.max_attendees) {
                        return { status: existing.status as 'going' | 'maybe' | 'cancelled', goingCount: count, maybeCount: 0, error: 'Event is at capacity' }
                    }
                }
            }
            await supabase
                .from('event_attendees')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
        } else {
            // New RSVP
            if (status === 'going') {
                const { data: event } = await supabase
                    .from('guild_events')
                    .select('max_attendees')
                    .eq('id', eventId)
                    .single()

                if (event?.max_attendees) {
                    const { count } = await supabase
                        .from('event_attendees')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', eventId)
                        .eq('status', 'going')

                    if (count !== null && count >= event.max_attendees) {
                        return { status: 'cancelled', goingCount: count, maybeCount: 0, error: 'Event is at capacity' }
                    }
                }
            }

            const { error: insertError } = await supabase
                .from('event_attendees')
                .insert({ event_id: eventId, user_id: user.id, status })

            if (insertError) {
                console.error('[GuildEvents] setRSVPStatus insert failed:', insertError)
                return { status: 'cancelled', goingCount: 0, maybeCount: 0, error: sanitizeErrorMessage(insertError) }
            }

            // SECURITY: Post-insert capacity re-check to mitigate race conditions
            if (status === 'going') {
                const { data: eventCheck } = await supabase
                    .from('guild_events')
                    .select('max_attendees')
                    .eq('id', eventId)
                    .single()

                if (eventCheck?.max_attendees) {
                    const { count: postInsertCount } = await supabase
                        .from('event_attendees')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', eventId)
                        .eq('status', 'going')

                    if (postInsertCount !== null && postInsertCount > eventCheck.max_attendees) {
                        await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', user.id)
                        return { status: 'cancelled', goingCount: eventCheck.max_attendees, maybeCount: 0, error: 'Event is at capacity' }
                    }
                }
            }
        }

        // Get updated counts
        const { count: goingCount } = await supabase
            .from('event_attendees')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'going')

        const { count: maybeCount } = await supabase
            .from('event_attendees')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'maybe')

        revalidatePath('/guild')
        return { status, goingCount: goingCount || 0, maybeCount: maybeCount || 0, error: null }
    } catch (err) {
        console.error('[GuildEvents] setRSVPStatus exception:', err)
        return { status: 'cancelled', goingCount: 0, maybeCount: 0, error: 'Failed to update RSVP' }
    }
}

/**
 * Get attendees for an event.
 *
 * @description Returns the list of users who RSVP'd "going" to an event.
 * @param eventId - The event to get attendees for
 * @param limit - Maximum number of attendees to return
 * @returns List of attendees with profile info and total count
 */
export async function getEventAttendees(eventId: string, limit: number = 50): Promise<{
    data: EventAttendee[]
    totalCount: number
    error: string | null
}> {
    try {
        const supabase = await createClient()

        const { data, error, count } = await supabase
            .from('event_attendees')
            .select(`
                *,
                profile:profiles!event_attendees_user_id_fkey(id, full_name, role, avatar_url)
            `, { count: 'exact' })
            .eq('event_id', eventId)
            .eq('status', 'going')
            .order('rsvp_at', { ascending: true })
            .limit(limit)

        if (error) {
            console.error('[GuildEvents] getEventAttendees failed:', error)
            return { data: [], totalCount: 0, error: sanitizeErrorMessage(error) }
        }

        return { data: (data || []) as EventAttendee[], totalCount: count || 0, error: null }
    } catch (err) {
        console.error('[GuildEvents] getEventAttendees exception:', err)
        return { data: [], totalCount: 0, error: 'Failed to fetch attendees' }
    }
}

/**
 * Check if the current user is attending a specific event.
 *
 * @param eventId - The event to check
 * @returns Whether the user has an active RSVP
 */
export async function isAttending(eventId: string): Promise<boolean> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return false

        const { data } = await supabase
            .from('event_attendees')
            .select('id')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .eq('status', 'going')
            .maybeSingle()

        return !!data
    } catch (error) {
        console.error('[GuildEvents] isAttending check failed:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            eventId,
        })
        return false
    }
}

/**
 * Get RSVP status and attendee count for multiple events at once.
 *
 * @description Batch query for efficient rendering of event lists.
 * Returns a map of event ID to { attending, count }.
 *
 * @param eventIds - Array of event IDs to check
 * @returns Map of event ID to RSVP status
 */
export async function getEventRSVPStatuses(eventIds: string[]): Promise<{
    data: Record<string, { attending: boolean; count: number; status: 'going' | 'maybe' | null; goingCount: number; maybeCount: number }>
    error: string | null
}> {
    try {
        if (eventIds.length === 0) return { data: {}, error: null }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Get all attendees for these events in one query (going + maybe)
        const { data: attendees, error } = await supabase
            .from('event_attendees')
            .select('event_id, user_id, status')
            .in('event_id', eventIds)
            .in('status', ['going', 'maybe'])

        if (error) {
            console.error('[GuildEvents] getEventRSVPStatuses failed:', error)
            return { data: {}, error: sanitizeErrorMessage(error) }
        }

        // Build the result map
        const result: Record<string, { attending: boolean; count: number; status: 'going' | 'maybe' | null; goingCount: number; maybeCount: number }> = {}
        for (const eventId of eventIds) {
            const eventAttendees = (attendees || []).filter(a => a.event_id === eventId)
            const goingAttendees = eventAttendees.filter(a => a.status === 'going')
            const maybeAttendees = eventAttendees.filter(a => a.status === 'maybe')
            const userAttendee = user ? eventAttendees.find(a => a.user_id === user.id) : null
            result[eventId] = {
                attending: userAttendee?.status === 'going',
                count: goingAttendees.length,
                status: userAttendee ? (userAttendee.status as 'going' | 'maybe') : null,
                goingCount: goingAttendees.length,
                maybeCount: maybeAttendees.length,
            }
        }

        return { data: result, error: null }
    } catch (err) {
        console.error('[GuildEvents] getEventRSVPStatuses exception:', err)
        return { data: {}, error: 'Failed to fetch RSVP statuses' }
    }
}

// ==========================================
// DASHBOARD & SUMMARY
// ==========================================

/**
 * Get guild events summary for widgets.
 *
 * @returns Upcoming count, next event, and total this month
 */
export async function getGuildEventsSummary(): Promise<{
    data: {
        upcomingCount: number
        nextEvent: GuildEvent | null
        totalThisMonth: number
    } | null
    error: string | null
}> {
    try {
        const supabase = await createClient()

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

        // Get upcoming events count
        const { count: upcomingCount } = await supabase
            .from('guild_events')
            .select('*', { count: 'exact', head: true })
            .gte('event_date', now.toISOString())

        // Get next event
        const { data: nextEvents } = await supabase
            .from('guild_events')
            .select(`
                *,
                creator:profiles!guild_events_created_by_fkey(id, full_name, role)
            `)
            .gte('event_date', now.toISOString())
            .order('event_date', { ascending: true })
            .limit(1)

        // Get this month's events count
        const { count: totalThisMonth } = await supabase
            .from('guild_events')
            .select('*', { count: 'exact', head: true })
            .gte('event_date', startOfMonth)
            .lte('event_date', endOfMonth)

        return {
            data: {
                upcomingCount: upcomingCount || 0,
                nextEvent: nextEvents?.[0] as GuildEvent || null,
                totalThisMonth: totalThisMonth || 0
            },
            error: null
        }
    } catch (err) {
        console.error('[GuildEvents] getGuildEventsSummary exception:', err)
        return { data: null, error: 'Failed to get summary' }
    }
}
