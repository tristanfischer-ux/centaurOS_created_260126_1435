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
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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
    type MemberRow = {
        id: string
        full_name: string | null
        role: string | null
        email: string | null
        foundry: { name: string } | { name: string }[] | null
    }
    
    let membersData: MemberRow[] = []
    let membersError: Error | null = null

    if (foundryId) {
        const result = await supabase
            .from('profiles')
            .select('id, full_name, role, email')
            .eq('foundry_id', foundryId)
            .neq('id', user.id) // Exclude current user
            .order('role', { ascending: true })
            .limit(50)
        
        membersData = (result.data as MemberRow[]) || []
        membersError = result.error
    }

    if (eventsError) {
        console.error('Error loading events:', eventsError)
    }

    if (membersError) {
        console.error('Error loading members:', membersError)
    }

    // Transform members data to flatten foundry name
    const transformedMembers = (membersData || []).map(member => {
        // Handle foundry which can be an object or array depending on join
        const foundry = member.foundry as unknown as { name: string } | { name: string }[] | null
        const foundryName = Array.isArray(foundry) 
            ? foundry[0]?.name 
            : foundry?.name
        
        return {
            id: member.id,
            full_name: member.full_name,
            role: member.role,
            email: member.email,
            foundry_name: foundryName || undefined
        }
    })

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
