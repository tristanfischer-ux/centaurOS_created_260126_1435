import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EventDetailContent } from './event-detail-content'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function EventDetailPage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    // Get the event
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

    // Get attendees
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

    // Check if current user is attending
    const { data: userRsvp } = await supabase
        .from('event_attendees')
        .select('id')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .eq('status', 'going')
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
            isAttending={!!userRsvp}
            canEdit={canEdit}
            currentUserId={user.id}
        />
    )
}
