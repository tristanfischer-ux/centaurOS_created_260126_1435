import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuildPageContent } from './guild-page-content'

export const dynamic = 'force-dynamic'

/**
 * Guild page — community hub for apprentice management, events, and networking.
 *
 * @description Server component that handles auth, role checks, and data loading.
 * Passes pre-fetched data to GuildPageContent client component.
 *
 * @security
 * - Requires authentication
 * - Only Founders, Executives, and Apprentices can access
 * - Non-authorized roles are redirected to /updates
 * - Members are filtered to Guild-relevant roles only
 */
export default async function GuildPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Get current user profile for role-based access
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    // AUTH: Role-based access control
    const canManageAssignments = profile.role === 'Founder' || profile.role === 'Executive'
    const isApprentice = profile.role === 'Apprentice'
    const isExecutive = profile.role === 'Founder' || profile.role === 'Executive'

    if (!canManageAssignments && !isApprentice) {
        redirect('/updates')
    }

    // Fetch guild-relevant members for the network tab
    // SECURITY: Only show members from the current user's foundry
    const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, foundry_id')
        .eq('foundry_id', profile.foundry_id)
        .in('role', ['Apprentice', 'Executive', 'Founder'])
        .order('full_name', { ascending: true })
        .limit(50)

    // Resolve foundry names in a single batch query to avoid FK join issues
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
            currentUserId={user.id}
            members={membersWithFoundry}
        />
    )
}
