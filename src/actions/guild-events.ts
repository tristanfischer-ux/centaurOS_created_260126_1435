'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// Types
export interface GuildEvent {
    id: string
    foundry_id: string | null
    title: string
    description: string | null
    event_date: string
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
}

// ==========================================
// GUILD EVENTS CRUD
// ==========================================

/**
 * Create a new guild event
 */
export async function createGuildEvent(data: {
    title: string
    description?: string
    eventDate: string
    locationGeo?: string
    locationAddress?: string
    isExecutiveOnly?: boolean
    maxAttendees?: number
}): Promise<{ data: GuildEvent | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()

        const { data: event, error } = await supabase
            .from('guild_events')
            .insert({
                foundry_id: foundryId,
                title: data.title.trim(),
                description: data.description?.trim() || null,
                event_date: data.eventDate,
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
            console.error('Error creating guild event:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/events')
        revalidatePath('/dashboard')
        return { data: event as GuildEvent, error: null }
    } catch (err) {
        console.error('Failed to create guild event:', err)
        return { data: null, error: 'Failed to create event' }
    }
}

/**
 * Get all guild events (respects RLS for executive-only visibility)
 */
export async function getGuildEvents(options?: {
    upcoming?: boolean
    past?: boolean
    limit?: number
}): Promise<{ data: GuildEvent[]; error: string | null }> {
    try {
        const supabase = await createClient()

        let query = supabase
            .from('guild_events')
            .select(`
                *,
                creator:profiles!guild_events_created_by_fkey(id, full_name, role)
            `)
            .order('event_date', { ascending: true })

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
            console.error('Error fetching guild events:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as GuildEvent[], error: null }
    } catch (err) {
        console.error('Failed to fetch guild events:', err)
        return { data: [], error: 'Failed to fetch events' }
    }
}

/**
 * Get upcoming guild events for dashboard widget
 */
export async function getUpcomingGuildEvents(limit: number = 3): Promise<{ data: GuildEvent[]; error: string | null }> {
    return getGuildEvents({ upcoming: true, limit })
}

/**
 * Get a single guild event by ID
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
            console.error('Error fetching guild event:', error)
            return { data: null, error: error.message }
        }

        return { data: data as GuildEvent, error: null }
    } catch (err) {
        console.error('Failed to fetch guild event:', err)
        return { data: null, error: 'Failed to fetch event' }
    }
}

/**
 * Update a guild event
 */
export async function updateGuildEvent(
    eventId: string,
    data: {
        title?: string
        description?: string
        eventDate?: string
        locationGeo?: string
        locationAddress?: string
        isExecutiveOnly?: boolean
        maxAttendees?: number
    }
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('guild_events')
            .update({
                ...(data.title && { title: data.title.trim() }),
                ...(data.description !== undefined && { description: data.description?.trim() || null }),
                ...(data.eventDate && { event_date: data.eventDate }),
                ...(data.locationGeo !== undefined && { location_geo: data.locationGeo || null }),
                ...(data.locationAddress !== undefined && { location_address: data.locationAddress || null }),
                ...(data.isExecutiveOnly !== undefined && { is_executive_only: data.isExecutiveOnly }),
                ...(data.maxAttendees !== undefined && { max_attendees: data.maxAttendees || null }),
                updated_at: new Date().toISOString()
            })
            .eq('id', eventId)

        if (error) {
            console.error('Error updating guild event:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/events')
        revalidatePath('/dashboard')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update guild event:', err)
        return { success: false, error: 'Failed to update event' }
    }
}

/**
 * Delete a guild event
 */
export async function deleteGuildEvent(eventId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('guild_events')
            .delete()
            .eq('id', eventId)

        if (error) {
            console.error('Error deleting guild event:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/events')
        revalidatePath('/dashboard')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete guild event:', err)
        return { success: false, error: 'Failed to delete event' }
    }
}

/**
 * Get guild events summary for dashboard
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
        console.error('Failed to get guild events summary:', err)
        return { data: null, error: 'Failed to get summary' }
    }
}
