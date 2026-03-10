import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventDetailContent } from './event-detail-content'

export const revalidate = 30

interface PageProps {
    params: Promise<{ id: string }>
}

/**
 * Guild event detail page.
 *
 * @description Shows full event info, attendee list, RSVP button, and delete
 * option for organisers. Server component that fetches event data and passes
 * it to the client-side EventDetailContent.
 *
 * @security Requires authentication. Executive-only events are still visible
 * here if the user navigates directly — RLS on guild_events handles visibility.
 */
export default async function EventDetailPage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Get current user profile for permission checks
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    // Get the event with creator info
    const { data: event, error } = await supabase
        .from('guild_events')
        .select(`
            *,
            creator:profiles!guild_events_created_by_fkey(id, full_name, role, avatar_url)
        `)
        .eq('id', id)
        .single()

    if (error || !event) {
        notFound()
    }

    // SECURITY: Non-executives cannot access executive-only events
    if (event.is_executive_only && profile.role !== 'Founder' && profile.role !== 'Executive') {
        notFound()
    }

    // Get attendees with profile info
    const { data: attendees } = await supabase
        .from('event_attendees')
        .select(`
            *,
            profile:profiles!event_attendees_user_id_fkey(id, full_name, role, avatar_url)
        `)
        .eq('event_id', id)
        .eq('status', 'going')
        .order('rsvp_at', { ascending: true })
        .limit(50)

    // Check current user's RSVP status (going, maybe, or null)
    const { data: userRsvp } = await supabase
        .from('event_attendees')
        .select('id, status')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .in('status', ['going', 'maybe'])
        .maybeSingle()

    // Get total attendee count
    const { count: attendeeCount } = await supabase
        .from('event_attendees')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'going')

    const isCreator = event.created_by === user.id
    const isFounder = profile.role === 'Founder'
    const canEdit = isCreator || isFounder

    return (
        <EventDetailContent
            event={event}
            attendees={attendees || []}
            attendeeCount={attendeeCount || 0}
            initialRsvpStatus={userRsvp?.status === 'going' ? 'going' : userRsvp?.status === 'maybe' ? 'maybe' : null}
            canEdit={canEdit}
            currentUserId={user.id}
        />
    )
}
