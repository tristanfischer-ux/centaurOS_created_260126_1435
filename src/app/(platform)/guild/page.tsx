import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuildTabs } from './guild-tabs'

export default async function GuildPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get User Profile for Role and Foundry
    const { data: profile } = await supabase.from('profiles').select('*, foundry:foundries(name)').eq('id', user.id).single()
    const isExecutive = profile?.role === 'Executive' || profile?.role === 'Founder'
    const foundryId = profile?.foundry_id

    // Fetch Events
    let eventsQuery = supabase.from('guild_events').select('*').order('event_date', { ascending: true })

    // Tiered Networking: Hide exec only events from apprentices
    if (!isExecutive) {
        eventsQuery = eventsQuery.eq('is_executive_only', false)
    }

    const { data: events, error: eventsError } = await eventsQuery

    // Fetch Network Members (from same foundry for now, could expand to all foundries)
    const { data: members, error: membersError } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, foundry:foundries(name)')
        .eq('foundry_id', foundryId)
        .neq('id', user.id) // Exclude current user
        .order('role', { ascending: true })
        .limit(50)

    if (eventsError) {
        console.error('Error loading events:', eventsError)
    }

    if (membersError) {
        console.error('Error loading members:', membersError)
    }

    // Transform members data to flatten foundry name
    const transformedMembers = (members || []).map(member => ({
        id: member.id,
        full_name: member.full_name,
        role: member.role,
        email: member.email,
        foundry_name: (member.foundry as { name: string } | null)?.name || undefined
    }))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">The Guild</h1>
                <p className="text-muted-foreground">
                    Virtual connectivity, physical reality. Connect, learn, and grow together.
                </p>
            </div>

            <GuildTabs 
                events={events || []} 
                members={transformedMembers}
                isExecutive={isExecutive}
            />
        </div>
    )
}
