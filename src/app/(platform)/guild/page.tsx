import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuildPageContent } from './guild-page-content'

export const dynamic = 'force-dynamic'

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
        redirect('/dashboard')
    }

    // Fetch guild members with foundry_id
    const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, foundry_id')
        .order('full_name', { ascending: true })
        .limit(50)

    // Resolve foundry names in a single batch query
    const foundryIds = [...new Set((members || [])
        .map(m => m.foundry_id)
        .filter((id): id is string => !!id)
    )]

    let foundryMap: Record<string, string> = {}
    if (foundryIds.length > 0) {
        const { data: foundries } = await supabase
            .from('foundries')
            .select('id, name')
            .in('id', foundryIds)
        
        foundryMap = (foundries || []).reduce((acc, f) => {
            acc[f.id] = f.name
            return acc
        }, {} as Record<string, string>)
    }

    const membersWithFoundry = (members || []).map(m => ({
        id: m.id,
        full_name: m.full_name,
        role: m.role,
        email: m.email,
        foundry_name: m.foundry_id ? foundryMap[m.foundry_id] : undefined,
    }))

    return (
        <GuildPageContent 
            isManager={canManageAssignments} 
            isApprentice={isApprentice} 
            isExecutive={isExecutive}
            members={membersWithFoundry}
            currentUserId={user.id}
        />
    )
}
