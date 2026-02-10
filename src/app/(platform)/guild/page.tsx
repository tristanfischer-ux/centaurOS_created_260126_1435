import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuildPageContent } from './guild-page-content'
import { getGuildEvents } from '@/actions/guild-events'

export default async function GuildPage() {
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

    // Check if user is a Founder or Executive (can browse pool and assign)
    // Or an Apprentice (can view their own assignments)
    const canManageAssignments = profile.role === 'Founder' || profile.role === 'Executive'
    const isApprentice = profile.role === 'Apprentice'
    const isExecutive = profile.role === 'Founder' || profile.role === 'Executive'

    if (!canManageAssignments && !isApprentice) {
        redirect('/updates')
    }

    // Fetch guild-relevant members for the network tab
    const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, foundry_id')
        .in('role', ['Apprentice', 'Executive', 'Founder'])
        .order('full_name', { ascending: true })
        .limit(50)

    // Resolve foundry names via a separate query to avoid FK join issues
    const foundryIds = [...new Set((members || []).map(m => m.foundry_id).filter(Boolean))]
    const { data: foundries } = foundryIds.length > 0
        ? await supabase.from('foundries').select('id, name').in('id', foundryIds)
        : { data: [] }
    const foundryNameMap = new Map((foundries || []).map(f => [f.id, f.name]))

    const membersWithFoundry = (members || []).map(m => ({
        id: m.id,
        full_name: m.full_name,
        role: m.role,
        email: m.email,
        foundry_name: m.foundry_id ? foundryNameMap.get(m.foundry_id) : undefined,
    }))

    // SECURITY: Fetch events server-side and filter executive-only events
    // before passing to client. Non-executives never receive executive-only event data.
    const eventsResult = await getGuildEvents({ upcoming: true, limit: 10 })
    const filteredEvents = (eventsResult.data || []).filter(
        e => !e.is_executive_only || isExecutive
    )

    return (
        <GuildPageContent 
            isManager={canManageAssignments} 
            isApprentice={isApprentice} 
            isExecutive={isExecutive}
            members={membersWithFoundry}
            initialEvents={filteredEvents}
        />
    )
}
